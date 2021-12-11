const basicInfo = {
    "apiName": "VTubeStudioPublicAPI",
    "apiVersion": "1.0",
    "requestID": "testID"
}

function buildRequest(type, data = null, requestId = "testId") { 
    let request = basicInfo;
    request.messageType = type;
    request.requestID = requestId;
    if (data) {
        request.data = data;
    }
    let returnValue = JSON.stringify(request);
    //console.log(returnValue);
    return returnValue;
}

exports.buildRequest = buildRequest;