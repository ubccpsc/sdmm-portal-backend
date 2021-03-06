import {expect} from "chai";
import "mocha";
import {DeliverablesController} from "../src/controllers/DeliverablesController";
import {Deliverable} from "../src/Types";
import {Test} from "./GlobalSpec";

const loadFirst = require('./GlobalSpec');

describe("DeliverablesController", () => {

    let dc: DeliverablesController;

    let DELIV1: Deliverable = null; // delivs are complex so just use one for the whole suite

    before(async () => {
        DELIV1 = {
            id:               Test.DELIVID1,
            org:              Test.ORGNAME,
            openTimestamp:    -1,
            closeTimestamp:   -1,
            gradesReleased:   false,
            delay:            -1,
            teamMinSize:      1,
            teamMaxSize:      1,
            teamSameLab:      false,
            teamStudentsForm: false
        };
    });

    beforeEach(() => {
        dc = new DeliverablesController();
    });

    it("Should be able to get all deliverables, even if there are none.", async () => {
        let delivs = await dc.getAllDeliverables(Test.ORGNAME);
        expect(delivs).to.have.lengthOf(0);
    });

    it("Should be able to save a deliverable.", async () => {
        let delivs = await dc.getAllDeliverables(Test.ORGNAME);
        expect(delivs).to.have.lengthOf(0);

        let valid = await dc.saveDeliverable(Test.ORGNAME, DELIV1);
        expect(valid).to.not.be.null;
        delivs = await dc.getAllDeliverables(Test.ORGNAME);
        expect(delivs).to.have.lengthOf(1);
        expect(delivs[0].id).to.equal(DELIV1.id);
    });

    it("Should update an existing deliverable.", async () => {
        let delivs = await dc.getAllDeliverables(Test.ORGNAME);
        expect(delivs).to.have.lengthOf(1);

        var deliv2: Deliverable = Object.assign({}, DELIV1);
        deliv2.gradesReleased = true;
        deliv2.teamMinSize = 4;

        let valid = await dc.saveDeliverable(Test.ORGNAME, deliv2);
        expect(valid).to.not.be.null;
        delivs = await dc.getAllDeliverables(Test.ORGNAME);
        expect(delivs).to.have.lengthOf(1);
        expect(delivs[0].gradesReleased).to.be.true;
        expect(delivs[0].teamMinSize).to.equal(4);
    });

    it("Should be able to get a specific deliverable.", async () => {
        let deliv = await dc.getDeliverable(Test.ORGNAME, Test.DELIVID1);
        expect(deliv).to.not.be.null;
        expect(deliv.id).to.equal(Test.DELIVID1);
    });

});
