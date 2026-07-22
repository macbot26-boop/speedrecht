  /*
    Copyright (C) 2016-2025 zafaco GmbH

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License version 3 
    as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http: //www.gnu.org/licenses/>.
*/

var logEnabled = true;
var dgram;
var now;


var WSWorker = function ()
{
    this.ip      = 'undefined';
    this.control = 'undefined';

    this.ulTimer = 4;

    return (this);
};

var webSocket;

var wsTarget;
var wsTargetPort;
var wsWss;
var wsProtocol;
var wsTestCase;
var wsID;
var wsFrameSize;
var wsData;
var wsFrames;
var wsCompleted;
var wsClient;
var wsTLD;
var iasMeasurementRunningTime;

var wsStateConnecting = 0;
var wsStateOpen       = 1;
var wsStateClosing    = 2;
var wsStateClosed     = 3;

var wsConnected = false;

var timerRunning = false;

var wsIpValues = 
{
    client        : undefined,
    tlsVersion    : undefined,
    tlsCipherSuite: undefined,
    tlsOverhed    : undefined,
};

var wsRttValues = 
{
    avg        : undefined,
    med        : undefined,
    min        : undefined,
    max        : undefined,
    requests   : undefined,
    replies    : undefined,
    errors     : undefined,
    missing    : undefined,
    packet_size: undefined,
    stDevPop   : undefined
};

var rttRequests       = 10;
var rttRequestTimeout = 1000;
var rttRequestWait    = 500;
var rttTimeout        = ((rttRequests * rttRequestTimeout) + rttRequestWait) * 1.3;
var rttPayloadSize    = 64;

var rttUdpSocket;
var rttUdpTimer;
var rttUdpMessage;
var rttUdpTimestampSend;
var rttUdpTimestampReceive;
var rttUdpFirstResponse = true;
var rttUdpRtts          = [];

var ulData;
var ulDataPointer;
var ulInterval;
var ulReportDict = {};

var ulDataSize            = 2246915;
var ulBufferSize          = 4096 * 1000;
var ulStarted             = false;
var timerIndexUploadFirst = 0;

var jsTool;

var ndServerFamily;


onmessage = function (event)
{
    var data;

    try
    {
        data = JSON.parse(event.data);
    } catch (error)
    {
        return;
    }

    wsID = data.wsID;

    switch (data.cmd)
    {
        case 'ip': {
            reportToControl('info', 'ip connecting');

            setWsParameters(data);
            connect();
            break;
        }

        case 'connect': {
            reportToControl('info', 'websocket connecting');
            setWsParameters(data);
            ndServerFamily = data.ndServerFamily;

            if (wsTestCase === 'upload') wsFrameSize = data.wsFrameSize;

            if (wsTestCase === 'rtt')
            {
                rttRequests       = data.rttRequests;
                rttRequestTimeout = data.rttRequestTimeout;
                rttRequestWait    = data.rttRequestWait;
                rttTimeout        = data.rttTimeout;
                rttPayloadSize    = data.rttPayloadSize;
            }

            connect();
            break;
        }

        case 'measurementStart': {


            timerRunning = true;

            reportToControl('report', 'startupCompleted');

            if (wsTestCase === 'download')
            {
                resetDownloadCounter();
                reportToControl('info', 'download counter reseted');
                break;
            }
        }

        case 'report': {
            reportToControl('report');

            if (wsTestCase === 'download')
            {
                resetDownloadCounter();
            }
            break;
        }

        case 'stop': {
            break;
        }


        case 'close': {
            wsCompleted = true;

            if (webSocket.readyState === wsStateClosed)
            {
                webSocket.close();
                this.close();
            } else
            {
                webSocket.close();
                websocketClose('close received');
                reportToControl('info', 'websocket closing');
            }
            break;
        }

        case 'rtt_udp': {
            setWsParameters(data);
            ndServerFamily = data.ndServerFamily;

            rttRequests       = data.rttRequests;
            rttRequestTimeout = data.rttRequestTimeout;
            rttRequestWait    = data.rttRequestWait;
            rttTimeout        = data.rttTimeout;
            rttPayloadSize    = data.rttPayloadSize;

            reportToControl('open', 'rtt_udp ready');

            wsRttValues.requests    = 0;
            wsRttValues.replies     = 0;
            wsRttValues.errors      = 0;
            wsRttValues.missing     = 0;
            wsRttValues.packet_size = rttPayloadSize;

            if (typeof require !== 'undefined')
            {
                const os = require('os');

                if (os.platform() === 'win32')
                {
                    os.setPriority(os.constants.priority.PRIORITY_HIGH);
                }

                dgram = require('node:dgram');
                now   = require('performance-now');

                rtt_udp();
            } else
            {
                reportToControl('error', 'require not supported');
            }

            break;
        }

        default: {
            reportToControl('error', 'Unknown command: ' + data.msg);
            break;
        }
    }
};


function connect()
{
    resetValues();

    if (typeof require === 'undefined') importScripts('libs/tool.js');

    if (typeof require === 'undefined')
    {
        jsTool = new JSTool();
        jsTool.enableLoggger(logEnabled);
    }

    var wsWssString                  = 'wss://';
    if  (!Number(wsWss)) wsWssString = 'ws://';

    var target = wsWssString + wsTarget + ':' + wsTargetPort;

    try
    {
        if (typeof require !== 'undefined')
        {
            const os = require('os');

            if (os.platform() === 'win32')
            {
                os.setPriority(os.constants.priority.PRIORITY_HIGH);
            }

            var logDebug      = false;
            var WebSocketNode = require('ws');
                webSocket     = new WebSocketNode(target, wsProtocol,
                {
                    origin           : 'https://' + wsTLD,
                    perMessageDeflate: false,
                    family           : ndServerFamily,
                    headers          : 
                    {
                        'Pragma'       : 'no-cache',
                        'Cache-Control': 'no-cache'
                    }
                });
        } else
        {
            webSocket = new WebSocket(target, wsProtocol);
        }
    } catch (error)
    {

        if (logDebug) reportToControl('info', 'webSocket error: try/catch: ' + error);
    }

    webSocket.onopen = function (event)
    {
        reportToControl('open', 'websocket open');
        wsConnected = true;

        if (wsTestCase === 'rtt')
        {
            rtt();
        } else if (wsTestCase === 'download')
        {
            download();
        } else if (wsTestCase === 'upload')
        {
            setTimeout(upload, 200);
            wsCompleted = false;
            ulData      = generateRandomData(ulDataSize, true, false);
        }
    };

    webSocket.onerror = function (event)
    {

        if (logDebug) reportToControl('info', 'webSocket error: onError: ' + event.type);
        if (!wsConnected && webSocket.readyState === wsStateClosed)
        {
            reportToControl('error', 'connection');
        }
    };

    webSocket.onmessage = function (event)
    {
        if (wsTestCase === 'download')
        {
            wsData      += event.data.size;
            wsFrameSize  = event.data.size;
            wsFrames++;
        } else
        {


            try
            {
                var data = JSON.parse(event.data);
            } catch (error)
            {


                return;
            }

            if (data.cmd === 'ip_report')
            {
                wsIpValues.client         = String(data.client);
                wsIpValues.tlsVersion     = String(data.tls_version);
                wsIpValues.tlsCipherSuite = String(data.tls_cipher_suite);
                wsIpValues.tlsOverhead    = Number(data.tls_overhead);

                reportToControl('report', String(data.msg));
                wsCompleted = true;

                if (webSocket.readyState === wsStateClosed)
                {
                    this.close();
                } else
                {
                    websocketClose('ip completed');
                }
            }

            if (data.cmd === 'rtt_report')
            {
                wsRttValues.avg         = (Number(data.avg) / 1000).toFixed(3);
                wsRttValues.med         = (Number(data.med) / 1000).toFixed(3);
                wsRttValues.min         = (Number(data.min) / 1000).toFixed(3);
                wsRttValues.max         = (Number(data.max) / 1000).toFixed(3);
                wsRttValues.requests    = Number(data.req);
                wsRttValues.replies     = Number(data.rep);
                wsRttValues.errors      = Number(data.err);
                wsRttValues.missing     = Number(data.mis);
                wsRttValues.packet_size = Number(data.pSz);
                wsRttValues.stDevPop    = (Number(data.std_dev_pop) / 1000).toFixed(3);
            }

            if (data.cmd === 'ul_report')
            {


                if (timerRunning && timerIndexUploadFirst === 0)
                {
                    timerIndexUploadFirst = Number(data.time);
                }


                if (timerIndexUploadFirst !== 0 && timerIndexUploadFirst === Number(data.time))
                {
                    for (var i = timerIndexUploadFirst; i <= timerIndexUploadFirst + ((iasMeasurementRunningTime / 1000) * 2 * 5); i = i + 5)
                    {
                        ulReportDict[i]      = {};
                        ulReportDict[i].bRcv = 0;
                        ulReportDict[i].hRcv = 0;
                    }
                }


                ulReportDict[Number(data.time)]      = {};
                ulReportDict[Number(data.time)].bRcv = Number(data.bRcv);
                ulReportDict[Number(data.time)].hRcv = Number(data.hRcv);
            }
        }
    };

    webSocket.onclose = function (event)
    {


            wsTestCase  = '';
        var closeReason = '';
        if (typeof require === 'undefined')
        {
            closeReason = ', reason: ' + jsTool.webSocketCloseReasons(event);
        }
        reportToControl('close', 'websocket closed' + closeReason);
    };
};


function rtt_udp()
{
    const { Buffer } = require('node:buffer');

    if (wsRttValues.requests >= rttRequests)
    {
        wsCompleted = true;

        return;
    }

    rttUdpMessage = generateRandomData(rttPayloadSize, true, false);

    const message      = Buffer.from(rttUdpMessage);
          rttUdpSocket = dgram.createSocket(ndServerFamily === 4 ? 'udp4' : 'udp6');

    rttUdpSocket.on('message', (msg) =>
    {
        rttUdpTimestampReceive = now();

        clearInterval(rttUdpTimer);
        rttUdpSocket.close();


        if (rttUdpFirstResponse)
        {
            rttUdpFirstResponse = false;
        } else
        {
            if (msg.toString() === rttUdpMessage && typeof rttUdpTimestampReceive !== 'undefined')
            {
                wsRttValues.replies++;

                rttUdpRtts.push(Number(rttUdpTimestampReceive) - Number(rttUdpTimestampSend));
                rttUdpRtts.sort((a, b) => a - b);

                wsRttValues.avg = (rttUdpRtts.reduce((a, b) => a + b, 0) / rttUdpRtts.length).toFixed(3);
                if (rttUdpRtts.length % 2 === 0)
                {
                    wsRttValues.med = Number((rttUdpRtts[rttUdpRtts.length / 2 - 1] + rttUdpRtts[rttUdpRtts.length / 2]) / 2).toFixed(3);
                } else
                {
                    wsRttValues.med = rttUdpRtts[Math.floor(rttUdpRtts.length / 2)].toFixed(3);
                }
                wsRttValues.min      = rttUdpRtts[0].toFixed(3);
                wsRttValues.max      = rttUdpRtts[rttUdpRtts.length - 1].toFixed(3);
                wsRttValues.stDevPop = Math.sqrt(rttUdpRtts.reduce((a, b) => a + Math.pow(b - wsRttValues.avg, 2), 0) / rttUdpRtts.length).toFixed(3);


                rtt_udp_reset_timestamps();
            } else
            {
                rtt_udp_reset_timestamps();


                wsRttValues.errors++;
            }
        }

        setTimeout(rtt_udp, rttRequestWait);
    });

    rttUdpSocket.on('error', (error) =>
    {
        rtt_udp_reset_timestamps();

        clearInterval(rttUdpTimer);
        rttUdpSocket.close();


        if (rttUdpFirstResponse)
        {
            rttUdpFirstResponse = false;
        } else
        {
            wsRttValues.errors++;
        }

        setTimeout(rtt_udp, rttRequestWait);
    });

    rttUdpSocket.bind(() =>
    {
        rttUdpSocket.connect(80, wsTarget, () =>
        {
            rttUdpSocket.send(message, (error) =>
            {
                rttUdpTimestampSend = now();

                if (!rttUdpFirstResponse)
                {
                    wsRttValues.requests++;
                }

                rttUdpTimer = setTimeout(rtt_udp_timeout, rttRequestTimeout);

                if (typeof error === 'undefined' || error === null)
                {

                } else
                {
                    rtt_udp_reset_timestamps();

                    clearInterval(rttUdpTimer);
                    rttUdpSocket.close();


                    if (rttUdpFirstResponse)
                    {
                        rttUdpFirstResponse = false;
                    } else
                    {
                        wsRttValues.errors++;
                    }

                    setTimeout(rtt_udp, rttRequestWait);
                }
            });
        });
    });
};

function rtt_udp_timeout()
{
    rtt_udp_reset_timestamps();

    clearInterval(rttUdpTimer);
    rttUdpSocket.close();


    if (rttUdpFirstResponse)
    {
        rttUdpFirstResponse = false;
    } else
    {
        wsRttValues.missing++;
    }

    setTimeout(rtt_udp, rttRequestWait);
};

function rtt_udp_reset_timestamps()
{
    rttUdpTimestampSend    = undefined;
    rttUdpTimestampReceive = undefined;
}


function rtt()
{
    sendToWebSocket('rttStart');
    reportToControl('info', 'start rtt');
};


function download()
{
    reportToControl('info', 'start download');
};


function upload()
{
    if (!ulStarted)
    {
        wsCompleted = false;
        reportToControl('info', 'start upload');
        ulStarted = true;
    }

    ulInterval = setInterval(function ()
    {
        if (webSocket.bufferedAmount <= ulBufferSize)
        {
            if (wsCompleted)
            {
                clearInterval(ulInterval);
            }

            var ulPayload      = ulData.slice(ulDataPointer, ulDataPointer + wsFrameSize);
                ulDataPointer += wsFrameSize;
            if (ulDataPointer > ulDataSize)
            {
                ulDataPointer = ulDataPointer - ulDataSize;
                ulPayload     = ulPayload + ulData.slice(0, ulDataPointer);
            }

            if (webSocket.readyState === wsStateOpen)
            {
                webSocket.send(ulPayload);
            }
        }
    }, this.ulTimer);
};


function generateRandomData(length, asString, asArrayBuffer)
{
    var mask  = '';
        mask += 'abcdefghijklmnopqrstuvwxyz';
        mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        mask += '0123456789';
        mask += '~`!@#$%^&*()_+-={}[]:;?,./|\\';

    if (asArrayBuffer)
    {
        var arrayBuffer = new ArrayBuffer(length);
        var bufferView  = new Uint8Array(arrayBuffer);
        for (var i = length; i > 0; --i)
        {
            bufferView[i] = mask.charCodeAt(Math.floor(Math.random() * mask.length));
        }
        return arrayBuffer;
    } else
    {
        var data = '';
        for (var i = length; i > 0; --i)
        {
            data += mask[Math.floor(Math.random() * mask.length)];
        }
        if (asString)
        {
            return data;
        } else
        {
            return new Blob([data]);
        }
    }
};


function reportToControl(cmd, msg)
{
    var data             = {};
        data.cmd         = cmd;
        data.msg         = '';
    if  (msg) data.msg   = msg;
        data.wsID        = wsID;
        data.wsFrameSize = wsFrameSize;

    if (webSocket)
    {
        data.wsState = webSocket.readyState;
    } else if (wsTestCase === 'rtt' && typeof require !== 'undefined')
    {
        data.wsState = wsStateOpen;
    }

    if (wsTestCase === 'ip')
    {
        data.wsIpValues = wsIpValues;
    }

    if (wsTestCase === 'rtt')
    {
        data.wsRttValues = wsRttValues;
    }

    if (wsTestCase === 'upload')
    {
        data.ulReportDict          = ulReportDict;
        data.timerIndexUploadFirst = timerIndexUploadFirst;
    }

    data.wsData   = wsData;
    data.wsFrames = wsFrames;

    if (typeof performance !== 'undefined')
    {
        data.wsTime = performance.now();
    } else
    {
        data.wsTime = 0;
    }

    self.postMessage(JSON.stringify(data));
};


function sendToWebSocket(cmd, msg)
{
    var data     = {};
        data.cmd = cmd;
        data.msg = msg;

    if (wsTestCase === 'rtt')
    {
        data.rttRequests       = rttRequests;
        data.rttRequestTimeout = rttRequestTimeout;
        data.rttRequestWait    = rttRequestWait;
        data.rttTimeout        = rttTimeout;
        data.rttPayloadSize    = rttPayloadSize;
    }

    if (webSocket.readyState === wsStateOpen) webSocket.send(JSON.stringify(data));
};


function setWsParameters(data)
{
    wsTarget                  = data.wsTarget;
    wsTargetPort              = data.wsTargetPort;
    wsWss                     = data.wsWss;
    wsProtocol                = data.wsProtocol;
    wsTestCase                = data.wsTestCase;
    wsTLD                     = data.wsTLD;
    iasMeasurementRunningTime = data.iasMeasurementRunningTime;
};


function resetDownloadCounter()
{
    wsData   = 0;
    wsFrames = 0;
};


function websocketClose(reason)
{
    webSocket.close();

    setTimeout(this.close, 200);
};


function resetValues()
{
    clearInterval(ulInterval);

    delete (webSocket);

    wsCompleted = false;

    wsData   = 0;
    wsFrames = 0;

    ulData        = 0;
    ulDataPointer = 0;
    ulReportDict  = {};
};