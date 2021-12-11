const events = require('events');
const Net = require('net');
const { parse } = require('path');
const utils = require('./vts_modules/utils');
const vtsConnection = require('./vts_modules/vtsConnector');
//const vtsConnector = require('./vts_modules/vtsConnector');

vtsConnection.eventEmitter.once("authComplete", startCode);
vtsConnection.connect();

var physicsState = null;
var caughtList = [];
var momentumListX = [];
var momentumListY = [];

const itemCount = 2;

//physics constants
const throwImpulse = 140;
const throwThreshold = 1;
const horizThrowMultiplier = 8.5;
const horizSpeedCap = 200;
const gravityConst = -10;
const hitboxHandX = 35;
const hitboxHandY = 25;
const momentumLowerCap = -20;
const momentumDecay = 0.95;
const bottomBoundary = -20;
const topBoundary = 530;
const leftBoundary = -175;
const rightBoundary = 175;

const randomStartForce = 100;
const randomThrowXFactor = 5;
const randomThrowYFactor = throwImpulse * 0.2;

/**
  TODO: Other users won't rig their hands with positive in the same direction,
  so some param-flipping in the program will likely be needed to support other users
 */ 

function startCode() {
    if (itemCount < 1) {
        process.exit(1);
    }
    for (let i = 0; i < itemCount; i++) {
        momentumListX.push(randomize(randomStartForce));
        momentumListY.push(randomize(randomStartForce));
        caughtList.push(false);
    }

    createParams();

    vtsConnection.eventEmitter.on("parameterListReceived", processPhysicsData);

    vtsConnection.eventEmitter.on("parameterUpdateComplete", () => vtsConnection.sendRequest(utils.buildRequest("Live2DParameterListRequest")));

    vtsConnection.sendRequest(utils.buildRequest("Live2DParameterListRequest"));
}

function randomize(multiplier) {
    return Math.random() * multiplier;
}

function processPhysicsData(data) {
    let physicsData = readPhysicsParams(data);
    if (physicsState == null) {
        physicsState = physicsData;
    }
    let newItemPositionList = evaluatePhysicsData(physicsData);
    let request = updateItemPosition(newItemPositionList);
    vtsConnection.sendRequest(request);
    physicsState = physicsData;
}

function readPhysicsParams(data) {
    let paramList = data.parameters;
    let physicsData = {
        "handLX": 0,
        "handLY": 0,
        "handRX": 0,
        "handRY": 0,
        "items": [],
        "itemVisible": 0
    };
    for (let i = 0; i < itemCount; i++) {
        physicsData.items.push({
            "valueX": 0,
            "valueY": 0
        });
    }
    paramList.forEach(element => {
        switch (element.name) {
            case "LHandPositionX":
                physicsData.handLX = element.value;
                break;
            case "LHandPositionY":
                physicsData.handLY = element.value;
                break;
            case "RHandPositionX":
                physicsData.handRX = element.value;
                break;
            case "RHandPositionY":
                physicsData.handRY = element.value;
                break;
            case "ItemsVisible":
                physicsData.itemVisible = element.value;
                break;
            default:
                let itemNum = element.name.charAt(4);
                if (element.name.startsWith("Item") && itemNum <= itemCount) {
                    if (element.name.includes("X")) physicsData.items[itemNum - 1].valueX = Number(Number(element.value).toFixed(2));
                    if (element.name.includes("Y")) physicsData.items[itemNum - 1].valueY = Number(Number(element.value).toFixed(2));
                }
                break;
        }
    });
    //console.log(physicsData);
    return physicsData;
}

function evaluatePhysicsData(physicsData) {
    let handLY = Number(Number(physicsData.handLY).toFixed(2));
    let handRY = Number(Number(physicsData.handRY).toFixed(2));
    let handLX = Number(Number(physicsData.handLX).toFixed(2));
    let handRX = Number(Number(physicsData.handRX).toFixed(2));
    let items = physicsData.items;
    let newItemPositionList = [];

    let throwing = false;

    for (let i = 0; i < itemCount; i++) {
        const item = items[i];
        let momentumX = momentumListX[i];
        let momentumY = momentumListY[i];
        let caught = caughtList[i];

        let newItemPosition = {
            "valueX": item.valueX,
            "valueY": item.valueY
        };
        let impulseX = 0;
        let impulseY = 0;
    
        //compare state
        if (caught && !throwing) {
            //Left Hand
            //check if ball was within hand hitbox last frame. if so, this hand was holding it, so check the hand's movement to decide whether to throw
            if (Math.abs(item.valueX - physicsState.handLX) < hitboxHandX && Math.abs(item.valueY - physicsState.handLY) < hitboxHandY) {
                if (handLY > physicsState.handLY + throwThreshold) {
                    let differenceY = handLY - physicsState.handLY;
                    if (differenceY > throwThreshold) {
                        console.log("throw");
                        impulseY += throwImpulse + randomize(randomThrowYFactor);
                        caught = false;
                        throwing = true;
                        //horizontal
                        let differenceX = handLX - physicsState.handLX;
                        if (differenceX == 0) {
                            impulseX = 0;
                        } else {
                            impulseX = (differenceX * horizThrowMultiplier)  + randomize(randomThrowXFactor);
                        }
                    } 
                }
                else {
                    newItemPosition.valueX = handLX;
                    newItemPosition.valueY = handLY;
                    //console.log("carry ball: " + newItemPosition.valueX);
                }
            }
    
            //Right Hand
            //check if ball was within hand hitbox last frame. if so, this hand was holding it, so check the hand's movement to decide whether to throw
            if (Math.abs(item.valueX - physicsState.handRX) < hitboxHandX && Math.abs(item.valueY - physicsState.handRY) < hitboxHandY) {
                if (handRY > physicsState.handRY + throwThreshold) {
                    let differenceY = handRY - physicsState.handRY;
                    if (differenceY > throwThreshold) {
                        //console.log("throw");
                        impulseY += throwImpulse + randomize(randomThrowYFactor);
                        caught = false;
                        throwing = true;
                        //horizontal
                        let differenceX = handRX - physicsState.handRX;
                        if (differenceX == 0) {
                            impulseX = 0;
                        } else {
                            impulseX = (differenceX * horizThrowMultiplier)  + randomize(randomThrowXFactor);
                        }
                    }
                }
                else {
                    newItemPosition.valueX = handRX;
                    newItemPosition.valueY = handRY;
                    //console.log("carry ball: " + newItemPosition.valueX);
                }
            }
    
            if (caught) {
                momentumX = 0;
                momentumY = 0;
                impulseX = 0;
                impulseY = 0;
            }
        }
    
        //acceleration/impulse
    
        //gravity
        impulseY += gravityConst;
        
        //collision
        if (!caught && momentumY < 0) {
            if (item.valueY >= (handLY - hitboxHandY) && (item.valueY - handLY < hitboxHandY)) {
                if (Math.abs(item.valueX - handLX) < hitboxHandX) {
                    newItemPosition.valueY = handLY;
                    caught = true;
                }
            }
            if (item.valueY >= (handRY - hitboxHandY) && (item.valueY - handRY < hitboxHandY)) {
                if (Math.abs(item.valueX - handRX) < hitboxHandX) {
                    newItemPosition.valueY = handRY;
                    caught = true;
                }
            }
        }
    
        if (momentumY < momentumLowerCap) momentumY = momentumLowerCap;
        if (momentumX > horizSpeedCap) momentumX = horizSpeedCap;
        if (!caught) {
            impulseX = impulseX + momentumX;
            impulseY = impulseY + momentumY;
            newItemPosition.valueX = item.valueX + impulseX;
            newItemPosition.valueY = item.valueY + impulseY;
            momentumX = impulseX * momentumDecay;
            momentumY = impulseY * momentumDecay;
            if (newItemPosition.valueY <= bottomBoundary) {
                newItemPosition.valueY = topBoundary;
                momentumY = 0;
            }
            if (newItemPosition.valueX > rightBoundary || newItemPosition.valueX < leftBoundary) {
                momentumX *= -1;
            }
        }
        momentumListX[i] = momentumX;
        momentumListY[i] = momentumY;
        caughtList[i] = caught;
        newItemPositionList.push(newItemPosition);
    }
    
    return newItemPositionList;
}

function updateItemPosition(newItemPositionList) {
    let array = [];
    for (let i = 0; i < itemCount; i++) {
        let item = newItemPositionList[i];
        array.push(vtsConnection.createParamValue("Item" + (i+1) + "X", Number(item.valueX).toFixed(4)));
        array.push(vtsConnection.createParamValue("Item" + (i+1) + "Y", Number(item.valueY).toFixed(4)));    
    }
    return vtsConnection.createParamBatch(array);
}

function createParams() {
    for (let i = 0; i < itemCount; i++) {
        vtsConnection.createNewParameter("Item" + (i+1) + "X", "item movement", -175, 175, 0);
        vtsConnection.createNewParameter("Item" + (i+1) + "Y", "item movement", -30, 530, 0);
    }
    
}