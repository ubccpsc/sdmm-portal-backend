import Log from "./util/Log";
import {AuthController} from "./controllers/AuthController";
import * as rp from "request-promise-native";
import {Config} from "./Config";
import {DatabaseController} from "./controllers/DatabaseController";
import {Auth, Person} from "./Types";
import {PersonController} from "./controllers/PersonController";
import {GradePayload, Payload, SDDMController, StatusPayload} from "./controllers/SDDMController";
import {GitHubController} from "./controllers/GitHubController";
import ClientOAuth2 = require("client-oauth2");

/**
 * Just a large body of static methods for translating between restify and the remainder of the system.
 */
export class RouteHandler {

    private static dc = DatabaseController.getInstance();
    private static pc = new PersonController();
    private static ac = new AuthController();

    public static getCredentials(req: any, res: any, next: any) {
        Log.trace('RouteHandler::getCredentials(..) - start');
        const user = req.headers.user;
        const token = req.headers.token;
        const org = req.headers.org;
        Log.info('RouteHandler::getCredentials(..) - org: ' + org + '; user: ' + user + '; token: ' + token);

        RouteHandler.ac.isValid(org, user, token).then(function (isValid) {
            Log.trace('RouteHandler::getCredentials(..) - in isValid(..)');
            if (isValid === true) {
                Log.trace('RouteHandler::getCredentials(..) - isValid true');
                RouteHandler.ac.isAdmin(org, user, token).then(function (isAdmin) {
                    Log.info('RouteHandler::getCredentials(..) - sending 200; isAdmin: ' + isAdmin);
                    res.send({user: user, token: token, isAdmin: true});
                }).catch(function (err) {
                    Log.info('RouteHandler::getCredentials(..) - isValid true; ERROR: ' + err);
                    res.send(400, {failure: {message: "Login error (getCredentials valid inner error)."}});
                });
            } else {
                Log.trace('RouteHandler::getCredentials(..) - sending 400');
                res.send(400, {failure: {message: "Login error (getCredentials invalid inner error)."}});
            }
        }).catch(function (err) {
            Log.error('RouteHandler::getCredentials(..) - ERROR: ' + err);
            res.send(400, {failure: {message: "Login error (getCredentials outer error)."}});
        });
    }

    public static getAuth(req: any, res: any, next: any) {
        Log.trace("RouteHandler::getAuth(..) - /auth redirect start");
        let config = Config.getInstance();

        const org = req.query.org;

        const githubRedirect = config.getProp('backendUrl') + ':' + config.getProp('backendPort') + '/githubCallback?org=' + org;
        Log.info("RouteHandler::getAuth(..) - /auth redirect; course: " + org + "; URL: " + githubRedirect);

        const setup = {
            clientId:         config.getProp('githubClientId'),
            clientSecret:     config.getProp('githubClientSecret'),
            accessTokenUri:   config.getProp('githubHost') + '/login/oauth/access_token',
            authorizationUri: config.getProp('githubHost') + '/login/oauth/authorize',
            redirectUri:      githubRedirect,
            scopes:           ['']
        };

        var githubAuth = new ClientOAuth2(setup);

        const uri = githubAuth.code.getUri();
        Log.trace("RouteHandler::getAuth(..) - /auth uri: " + uri);
        res.redirect(uri, next);
    }

    public static githubCallback(req: any, res: any, next: any) {
        Log.trace("RouteHandler::githubCallback(..) - /githubCallback - start");
        let config = Config.getInstance();
        const org = req.query.org;

        let personController = new PersonController();

        // TODO: do we need this redirect?
        let backendUrl = config.getProp('backendUrl');
        let backendPort = config.getProp('backendPort');
        const githubRedirect = backendUrl + ':' + backendPort + '/githubCallback?orgName=secapstone';
        Log.info('RouteHandler::githubCallback(..) - / githubCallback; URL: ' + githubRedirect);

        const opts = {
            clientId:         config.getProp('githubClientId'),
            clientSecret:     config.getProp('githubClientSecret'),
            accessTokenUri:   config.getProp('githubHost') + '/login/oauth/access_token',
            authorizationUri: config.getProp('githubHost') + '/login/oauth/authorize',
            redirectUri:      githubRedirect,
            scopes:           ['']
        };

        const githubAuth = new ClientOAuth2(opts);

        let token: string | null = null;
        let p: Person = null;

        // Log.info('RouteHandler::githubCallback(..) - opts: ' + JSON.stringify(opts));

        githubAuth.code.getToken(req.url).then(function (user) {
            Log.trace("RouteHandler::githubCallback(..) - token acquired");

            token = user.accessToken;
            var options = {
                uri:     config.getProp('githubAPI') + '/user',
                method:  'GET',
                headers: {
                    'Content-Type':  'application/json',
                    'User-Agent':    'Portal',
                    'Authorization': 'token ' + token
                }
            };
            // this extra check isn't strictly required, but means we can
            // associate a username with a token on the backend if needed
            return rp(options);
        }).then(function (ans) {
            Log.info("RouteHandler::githubCallback(..) - /githubCallback - GH username received");
            const body = JSON.parse(ans);
            const username = body.login;
            Log.info("RouteHandler::githubCallback(..) - /githubCallback - GH username: " + username);

            // NOTE: this is not what you want for non micromasters
            // this will create a person every time
            // but for ubc courses we want to give a reject message for unknown users

            p = {
                id:            username,
                csId:          username, // sdmm doesn't have these
                githubId:      username,
                studentNumber: null,

                org:    org,
                fName:  '',
                lName:  '',
                kind:   'student',
                URL:    'https://github.com/' + username,
                labId:  'UNKNOWN',
                custom: {}
            };

            const auth: Auth = {
                org:      org,
                personId: username,
                token:    token
            };

            return DatabaseController.getInstance().writeAuth(auth);
        }).then(function (authWritten) {
            Log.info("RouteHandler::githubCallback(..) - authWritten: " + authWritten);

            // TODO: this should really handoff to an org-based controller to decide if we should
            // create a new person or return an error. This is fine for SDMM, but will need to
            // change in the future.

            return personController.createPerson(p);
            // return personController.getPerson(courseId, username)
        }).then(function (person) {
            Log.info("RouteHandler::githubCallback(..) - person: " + person);
            let feUrl = config.getProp('frontendUrl');
            let fePort = config.getProp('frontendPort');

            if (person !== null) {
                // only header method that worked for me
                res.setHeader("Set-Cookie", "token=" + token);
                if (feUrl.indexOf('//') > 0) {
                    feUrl = feUrl.substr(feUrl.indexOf('//') + 2, feUrl.length);
                }
                Log.trace("RouteHandler::githubCallback(..) - /githubCallback - redirect URL: " + feUrl);
                res.redirect({
                    hostname: feUrl,
                    pathname: '/index.html',
                    port:     fePort
                }, next);
            } else {
                // TODO: specify 'unknown user' error message (SDMM will always be true, but for future courses this won't be true)
                res.redirect({
                    hostname: feUrl,
                    pathname: '/index.html',
                    port:     fePort
                }, next);
            }
            // res.redirect('https://localhost:3000/index.html', next);
            // res.send({success: true, data: 'myFoo'});

        }).catch(function (err) {
            // code incorrect or expired
            Log.error("RouteHandler::githubCallback(..) - /githubCallback - ERROR: " + err);
            // NOTE: should this be returning 400 or something?
            return next();
        });
    }

    // from restify #284
    public static handlePreflight(req: any, res: any) {
        Log.trace("RouteHandler::handlePreflight(..) - " + req.method.toLowerCase() + "; uri: " + req.url);

        var allowHeaders = ['Accept', 'Accept-Version', 'Content-Type', 'Api-Version', 'user-agent', 'user', 'token', 'org'];
        if (res.methods.indexOf('OPTIONS') === -1) {
            res.methods.push('OPTIONS');
        }

        if (res.methods.indexOf('GET') === -1) {
            res.methods.push('GET');
        }

        res.header('Access-Control-Allow-Credentials', true);
        res.header('Access-Control-Allow-Headers', allowHeaders.join(', '));
        res.header('Access-Control-Allow-Methods', res.methods.join(', '));
        res.header('Access-Control-Allow-Origin', req.headers.origin);

        // Log.trace("RouteHandler::handlePreflight(..) - sending 204");
        return res.send(204);
    }


    /**
     *
     * Return message: Payload
     *
     * @param req
     * @param res
     * @param next
     */
    public static getCurrentStatus(req: any, res: any, next: any) {
        Log.trace('RouteHandler::getCurrentStatus(..) - /getCurrentStatus - start');
        const user = req.headers.user;
        const token = req.headers.token;

        // TODO: verify token

        const org = Config.getInstance().getProp('org');

        let sc: SDDMController = new SDDMController(new GitHubController());
        sc.getStatus(org, user).then(function (status: StatusPayload) {
            Log.info('RouteHandler::getCurrentStatus(..) - sending 200; user: ' + user);
            Log.trace('RouteHandler::getCurrentStatus(..) - sending 200; user: ' + user + '; status: ' + JSON.stringify(status));
            const ret: Payload = {success: status};
            res.send(ret);
        }).catch(function (err) {
            Log.info('RouteHandler::getCurrentStatus(..) - sending 400');
            res.send(400, {failure: {message: err}});
        });
    }

    public static performAction(req: any, res: any, next: any) {
        Log.info('RouteHandler::performAction(..) - /performAction - start');
        const user = req.headers.user;
        const token = req.headers.token;
        const org = req.headers.org;
        const action = req.params.action;
        const param = req.params.param; // might not be set

        // TODO: verify token

        let sc: SDDMController = new SDDMController(new GitHubController());

        if (action === 'provisionD0') {
            sc.provision(org, "d0", [user]).then(function (provisionResult) {
                Log.trace('RouteHandler::performAction(..) - sending 200; result: ' + JSON.stringify(provisionResult));
                res.send(provisionResult);
            }).catch(function (err) {
                Log.trace('RouteHandler::performAction(..) - sending 400');
                res.send(400, {failure: {message: 'Unable to provision d0 repository; please try again later.'}});
            });

        } else if (action === 'provisionD1individual') {
            sc.provision(org, "d1", [user]).then(function (provisionResult) {
                if (typeof provisionResult.success !== 'undefined') {
                    Log.info('RouteHandler::performAction(..) - sending 200; success: ' + JSON.stringify(provisionResult));
                } else {
                    Log.info('RouteHandler::performAction(..) - sending 200; failure: ' + JSON.stringify(provisionResult));
                }

                res.send(provisionResult);
            }).catch(function (err) {
                Log.trace('RouteHandler::performAction(..) - sending 400');
                res.send(400, {failure: {message: 'Unable to provision d1 repository; please try again later.'}});
            });
        } else if (action === 'provisionD1team') {
            sc.provision(org, "d1", [user, param]).then(function (provisionResult) {
                if (typeof provisionResult.success !== 'undefined') {
                    Log.info('RouteHandler::performAction(..) - sending 200; success: ' + JSON.stringify(provisionResult));
                } else {
                    Log.info('RouteHandler::performAction(..) - sending 200; failure: ' + JSON.stringify(provisionResult));
                }
                res.send(provisionResult);
            }).catch(function (err) {
                Log.trace('RouteHandler::performAction(..) - sending 400');
                res.send(400, {failure: {message: 'Unable to provision d1 repository; please try again later.'}});
            });

        } else {
            Log.trace('RouteHandler::performAction(..) - /performAction - unknown action: ' + action);
            res.send(404, {error: 'Unknown action'});
        }
    }


    // that.rest.get('/container/:org/:delivId', RouteHandler.atContainerDetails);
    public static atContainerDetails(req: any, res: any, next: any) {
        Log.info('RouteHandler::atContainerDetails(..) - /container/:org/:delivId - start GET');
        // const user = req.headers.user;
        // const token = req.headers.token;

        // TODO: verify secret

        const org = req.params.org;
        const delivId = req.params.delivId;

        Log.info('RouteHandler::atContainerDetails(..) - org: ' + org + '; delivId: ' + delivId);

        // TODO: this is just a dummy implementation

        if (org === 'secapstone' || org === 'secapstonetest') {
            res.send({dockerImage: 'secapstone-grader', studentDelay: 60 * 60 * 12, maxExecTime: 300, regressionDelivIds: []});
        } else {
            res.send(400, {message: 'Invalid org: ' + org});
        }


        /*
                let sc: SDDMController = new SDDMController(new GitHubController());
                sc.getStatus(org, user).then(function (status) {
                    Log.trace('RouteHandler::getCurrentStatus(..) - sending 200; user: ' + user + '; status: ' + status);
                    res.send({user: user, status: status});
                }).catch(function (err) {
                    Log.trace('RouteHandler::getCurrentStatus(..) - sending 400');
                    res.send(400, {error: err});
                });
        */
    }


    public static atDefaultDeliverable(req: any, res: any, next: any) {
        Log.info('RouteHandler::atDefaultDeliverable(..) - /defaultDeliverable/:org - start GET');
        // const user = req.headers.user;
        // const token = req.headers.token;

        // TODO: verify secret

        const org = req.params.org;

        Log.info('RouteHandler::atDefaultDeliverable(..) - org: ' + org);

        // TODO: this is just a dummy implementation

        if (org === 'secapstone' || org === 'secapstonetest') {
            res.send({delivId: 'd0'});
        } else {
            res.send(400, {error: 'unknown course'});
        }

        /*
                let sc: SDDMController = new SDDMController(new GitHubController());
                sc.getStatus(org, user).then(function (status) {
                    Log.trace('RouteHandler::getCurrentStatus(..) - sending 200; user: ' + user + '; status: ' + status);
                    res.send({user: user, status: status});
                }).catch(function (err) {
                    Log.trace('RouteHandler::getCurrentStatus(..) - sending 400');
                    res.send(400, {error: err});
                });
        */
    }


    public static atGradeResult(req: any, res: any, next: any) {
        Log.info('RouteHandler::atGradeResult(..) - start');
        // const user = req.headers.user;
        // const token = req.headers.token;

        // TODO: verify admin secret

        const org = req.params.org;
        const repoId = req.params.repoId;
        const delivId = req.params.delivId;

        const gradeRecord: GradePayload = req.body; // turn into json?

        Log.info('RouteHandler::atGradeResult(..) - org: ' + org + '; repoId: ' + repoId + '; delivId: ' + delivId + '; body: ' + JSON.stringify(gradeRecord));

        let sc = new SDDMController(new GitHubController());
        sc.handleNewGrade(org, repoId, delivId, gradeRecord).then(function (success) {
            res.send({success: true}); // respond
        }).catch(function (err) {
            res.send({success: true}); // respond true, they can't do anything anyways
            Log.error('RouteHandler::atGradeResult(..) - ERROR: ' + err);
        });

        /*
                let sc: SDDMController = new SDDMController(new GitHubController());
                sc.getStatus(org, user).then(function (status) {
                    Log.trace('RouteHandler::getCurrentStatus(..) - sending 200; user: ' + user + '; status: ' + status);
                    res.send({user: user, status: status});
                }).catch(function (err) {
                    Log.trace('RouteHandler::getCurrentStatus(..) - sending 400');
                    res.send(400, {error: err});
                });
        */
    }

    public static atIsStaff(req: any, res: any, next: any) {
        Log.info('RouteHandler::atIsStaff(..) - /isStaff/:org/:personId - start GET');
        // const user = req.headers.user;
        // const token = req.headers.token;

        // TODO: verify secret

        const org = req.params.org;
        const personId = req.params.personId;

        Log.info('RouteHandler::atIsStaff(..) - org: ' + org + '; personId: ' + personId);

        // TODO: this is just a dummy implementation

        if (personId === 'rtholmes' || personId === 'nickbradley') {
            res.send({org: org, personId: personId, isStaff: true});
        } else {
            res.send({org: org, personId: personId, isStaff: false});
        }

        /*
                let sc: SDDMController = new SDDMController(new GitHubController());
                sc.getStatus(org, user).then(function (status) {
                    Log.trace('RouteHandler::getCurrentStatus(..) - sending 200; user: ' + user + '; status: ' + status);
                    res.send({user: user, status: status});
                }).catch(function (err) {
                    Log.trace('RouteHandler::getCurrentStatus(..) - sending 400');
                    res.send(400, {error: err});
                });
        */
    }


    /**
     * This route forwards GitHub webhooks from the public-facing backend to AutoTest's
     * endpoint (which can be internal and protected).
     *
     * @param req
     * @param res
     * @param next
     */
    public static githubWebhook(req: any, res: any, next: any) {
        Log.info('RouteHandler::githubWebhook(..) - start');
        const webhookBody: any = req.body;
        // Log.info('RouteHandler::githubWebhook(..) - body: ' + JSON.stringify(webhookBody));

        const url = Config.getInstance().getProp('autotestUrl') + ':' + Config.getInstance().getProp('autotestPort') + '/githubWebhook';
        var options = {
            uri:     url, //  https://sdmm.cs.ubc.ca:11333/submit',
            method:  'POST',
            json:    true,
            headers: req.headers, // use GitHub's headers
            body:    webhookBody
        };

        return rp(options).then(function (succ) {
            Log.info('RouteHandler::githubWebhook(..) - success: ' + JSON.stringify(succ));
            res.send(200, succ); // send interpretation back to GitHub
        }).catch(function (err) {
            Log.error('RouteHandler::githubWebhook(..) - ERROR: ' + err);
            res.send(400, {error: err}); // respond no
        })
    }

}