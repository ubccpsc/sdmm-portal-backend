import {expect} from "chai";
import "mocha";
import {Test} from "./GlobalSpec";
import {AuthController} from "../src/controllers/AuthController";

const loadFirst = require('./GlobalSpec');
const teamsFirst = require('./PersonControllerSpec');

describe("AuthController", () => {

    let ac: AuthController;

    before(async () => {
    });

    beforeEach(() => {
        ac = new AuthController();
    });

    it("Should not validate a user who does not exist.", async () => {
        let isValid = await ac.isValid(Test.ORGNAME, Test.USERNAME3, ''); // not registered
        expect(isValid).to.be.false;
    });


    it("Should not let invalid be admins.", async () => {
        let isValid = await ac.isAdmin(Test.ORGNAME, Test.USERNAME3, ''); // not registered
        expect(isValid).to.be.false;
    });


    // TODO: implement auth controller tests
    /*
    let rc: RepositoryController;
    let tc: TeamController;
    let pc: PersonController;

    before(async () => {
    });

    beforeEach(() => {
        tc = new TeamController();
        rc = new RepositoryController();
        pc = new PersonController();
    });

    it("Should be able to get all repositories, even if there are none.", async () => {
        let repos = await rc.getAllRepos(Test.ORGNAME);
        expect(repos).to.have.lengthOf(0);
    });

    it("Should be able to create a repo.", async () => {
        let repos = await rc.getAllRepos(Test.ORGNAME);
        expect(repos).to.have.lengthOf(0);

        let team = await tc.getTeam(Test.ORGNAME, Test.TEAMNAME1);
        expect(team).to.not.be.null;

        let repo = await rc.createRepository(Test.ORGNAME, Test.REPONAME1, [team], {});
        expect(repo).to.not.be.null;

        repos = await rc.getAllRepos(Test.ORGNAME);
        expect(repos).to.have.lengthOf(1);
    });

    it("Should not create a repo a second time.", async () => {
        let repos = await rc.getAllRepos(Test.ORGNAME);
        expect(repos).to.have.lengthOf(1);

        let team = await tc.getTeam(Test.ORGNAME, Test.TEAMNAME1);
        expect(team).to.not.be.null;

        let repo = await rc.createRepository(Test.ORGNAME, Test.REPONAME1, [team], {});
        expect(repo).to.not.be.null;

        repos = await rc.getAllRepos(Test.ORGNAME);
        expect(repos).to.have.lengthOf(1);
    });

    it("Should be able to find all repos for a user.", async () => {
        let repos = await rc.getAllRepos(Test.ORGNAME);
        expect(repos).to.have.lengthOf(1);

        const person = await pc.getPerson(Test.ORGNAME, Test.USERNAME1);
        repos = await rc.getReposForPerson(person);
        expect(repos).to.have.lengthOf(1);
    });
    */
});
