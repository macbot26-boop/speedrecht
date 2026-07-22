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
  along with this program.  If not, see <http:   //www.gnu.org/licenses/>.
*/

var jsTool = new JSTool();
jsTool.enableLoggger(logEnabled);


function Control()
{
    this.iasMeasurement = '';
    this.callback       = '';

    var wsTestCase;
    var wsData;
    var wsDataTotal;
    var wsFrames;
    var wsFramesTotal;
    var wsSpeedAvgBitS;
    var wsSpeedAvgMBitS;
    var wsSpeedMinBitS;
    var wsSpeedMaxBitS;
    var wsOverhead;
    var wsOverheadTotal;
    var wsStartTime;
    var wsEndTime;
    var iasMeasurementTime;
    var iasMeasurementTimeTotal;
    var wsStartupStartTime;
    var wsOverheadPerFrame;
    var wsWorkers;
    var wsWorkersStatus;
    var wsWorkerTime;
    var wsInterval;
    var iasMeasurementRunningTime;
    var wsAdditionalMeasurementRunningTime;
    var wsCompleted;
    var wsReportInterval;
    var wsTimeoutTimer;
    var wsTimeout;
    var wsStartupTimeout;
    var wsProtocol;
    var wsStreamsStart;
    var wsStreamsEnd;
    var wsFrameSize;
    var iasMeasurementError;

    var tlsOverhead;
    var tlsOverheadTotal;

    var wsStateConnecting = 0;
    var wsStateOpen       = 1;
    var wsStateClosing    = 2;
    var wsStateClosed     = 3;


    var rttReportInterval = 501;
    var rttProtocol       = 'rtt';


    var dlReportInterval     = 501;
    var dlWsOverheadPerFrame = 4;
    var dlData               = 0;
    var dlFrames             = 0;
    var dlStartupData        = 0;
    var dlStartupFrames      = 0;
    var dlProtocol           = 'download';


    var ulReportInterval      = 501;
    var ulWsOverheadPerFrame  = 8;
    var ulReportDict          = {};
    var ulStartupData         = 0;
    var ulStartupFrames       = 0;
    var ulProtocol            = 'upload';
    var timerIndexUploadFirst = 0;


    var wsIntermediates = [];


    var wsTarget;
    var wsTLD;
    var wsTargetPort;
    var wsWss;


    var rttRequests       = 10;
    var rttRequestTimeout = 1000;
    var rttRequestWait    = 500;
    var rttTimeout        = ((rttRequests + 1) * (rttRequestTimeout + rttRequestWait)) * 1.1;
    var rttPayloadSize    = 64;

    var dlStartupTime            = 3000;
    var dlMeasurementRunningTime = 10000;
    var dlParallelStreams        = 4;
    var dlTimeout                = 15000;

    var ulStartupTime                      = 3000;
    var ulMeasurementRunningTime           = 10000;
    var ulAdditionalMeasurementRunningTime = 2000;
    var ulParallelStreams                  = 4;
    var ulTimeout                          = 15000;
    var ulFrameSize                        = 2000000;

    var wsParallelStreams;
    var wsStartupTime;

    var wsWorkerPath = 'worker.js';
    var htPostPath   = 'post.js';

    var ip_tls_overhead;


    var wsErrorCode;
    var wsErrorDescription;

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

    var wsDownloadValues = 
    {
        rateAvg         : undefined,
        rateMin         : undefined,
        rateMax         : undefined,
        data            : undefined,
        dataTotal       : undefined,
        duration        : undefined,
        durationTotal   : undefined,
        streamsStart    : undefined,
        streamsEnd      : undefined,
        frameSize       : undefined,
        frames          : undefined,
        framesTotal     : undefined,
        overheadPerFrame: undefined,
        overhead        : undefined,
        overheadTotal   : undefined,
        rateAvgMbps     : undefined,
        intermediates   : undefined
    };

    var wsUploadValues = 
    {
        rateAvg         : undefined,
        rateMin         : undefined,
        rateMax         : undefined,
        data            : undefined,
        dataTotal       : undefined,
        duration        : undefined,
        durationTotal   : undefined,
        streamsStart    : undefined,
        streamsEnd      : undefined,
        frameSize       : undefined,
        frames          : undefined,
        framesTotal     : undefined,
        overheadPerFrame: undefined,
        overhead        : undefined,
        overheadTotal   : undefined,
        rateAvgMbps     : undefined,
        intermediates   : undefined
    };


    this.measurementSetup = function (measurementParameters)
    {
        resetValues();

        iasMeasurementError   = false;
        measurementParameters = JSON.parse(measurementParameters);
        wsTestCase            = measurementParameters.testCase;

        switch (wsTestCase)
        {
            case 'rtt': {
                if (typeof measurementParameters.wsRttRequests !== 'undefined') rttRequests             = Number(measurementParameters.wsRttRequests);
                if (typeof measurementParameters.wsRttRequestTimeout !== 'undefined') rttRequestTimeout = Number(measurementParameters.wsRttRequestTimeout);
                if (typeof measurementParameters.wsRttRequestWait !== 'undefined') rttRequestWait       = Number(measurementParameters.wsRttRequestWait);
                if (typeof measurementParameters.wsRttTimeout !== 'undefined') rttTimeout               = Number(measurementParameters.wsRttTimeout);
                if (typeof measurementParameters.wsRttPayloadSize !== 'undefined') rttPayloadSize       = Number(measurementParameters.wsRttPayloadSize);
                   wsParallelStreams                                                                    = 1;
                   iasMeasurementRunningTime                                                            = rttTimeout;
                   wsReportInterval                                                                     = rttReportInterval;
                   wsProtocol                                                                           = rttProtocol;
                   wsTimeout                                                                            = dlTimeout;
                break;
            }
            case 'download': {
                wsOverheadPerFrame                = dlWsOverheadPerFrame;
                wsDownloadValues.overheadPerFrame = dlWsOverheadPerFrame;
                wsParallelStreams                 = dlParallelStreams;
                wsStartupTime                     = dlStartupTime;
                iasMeasurementRunningTime         = dlMeasurementRunningTime;
                wsReportInterval                  = dlReportInterval;
                wsTimeout                         = dlTimeout;
                wsProtocol                        = dlProtocol;
                break;
            }
            case 'upload': {
                if (typeof measurementParameters.wsUploadFrameSize !== 'undefined')
                {
                    ulFrameSize = Number(measurementParameters.wsUploadFrameSize);
                }

                wsFrameSize = ulFrameSize;

                if (ulFrameSize >= 65536)
                {
                    ulWsOverheadPerFrame = 12;
                } else if (ulFrameSize < 126)
                {
                    ulWsOverheadPerFrame = 6;
                }

                wsOverheadPerFrame                 = ulWsOverheadPerFrame;
                wsUploadValues.overheadPerFrame    = ulWsOverheadPerFrame;
                wsParallelStreams                  = ulParallelStreams;
                wsStartupTime                      = ulStartupTime;
                iasMeasurementRunningTime          = ulMeasurementRunningTime + ulAdditionalMeasurementRunningTime;
                wsAdditionalMeasurementRunningTime = ulAdditionalMeasurementRunningTime;
                wsReportInterval                   = ulReportInterval;
                wsTimeout                          = ulTimeout;
                wsProtocol                         = ulProtocol;
                break;
            }
        }

        if (typeof measurementParameters.wsTarget !== 'undefined') wsTarget                                                                                 = String(measurementParameters.wsTarget);
        if (typeof measurementParameters.wsTLD !== 'undefined') wsTLD                                                                                       = String(measurementParameters.wsTLD);
        if (typeof measurementParameters.wsTargetPort !== 'undefined') wsTargetPort                                                                         = String(measurementParameters.wsTargetPort);
        if (typeof measurementParameters.wsWss !== 'undefined') wsWss                                                                                       = String(measurementParameters.wsWss);
        if (typeof measurementParameters.wsStartupTime !== 'undefined') wsStartupTime                                                                       = Number(measurementParameters.wsStartupTime);
        if (typeof measurementParameters.wsTimeout !== 'undefined') wsTimeout                                                                               = Number(measurementParameters.wsTimeout);
        if (typeof measurementParameters.wsParallelStreams !== 'undefined' && (wsTestCase === 'download' || wsTestCase === 'upload')) wsParallelStreams     = Number(measurementParameters.wsParallelStreams);
        if (typeof measurementParameters.wsMeasureTime !== 'undefined' && (wsTestCase === 'download' || wsTestCase === 'upload')) iasMeasurementRunningTime = Number(measurementParameters.wsMeasureTime);

        if (typeof measurementParameters.wsWorkerPath !== 'undefined') wsWorkerPath = String(measurementParameters.wsWorkerPath);
        if (typeof measurementParameters.htPostPath !== 'undefined') htPostPath     = String(measurementParameters.htPostPath);


        reportToMeasurement('info', 'starting measurement');

        console.log(wsTestCase + ': starting measurement using parameters:');
        var wsWssString                  = 'wss://';
        if  (!Number(wsWss)) wsWssString = 'ws://';

        wsTarget = wsTarget + '.' + wsTLD;

        if (wsTestCase === 'rtt')
        {
            if (typeof require !== 'undefined')
            {
                console.log('target:            ' + wsTarget + ':80');
                console.log('protocol:          rtt_udp');
            } else
            {
                console.log('target:            ' + wsWssString + wsTarget + ':' + wsTargetPort);
                console.log('protocol:          ' + rttProtocol);
            }

            console.log('requests:          ' + rttRequests);
            console.log('request timeout:   ' + rttRequestTimeout);
            console.log('request wait:      ' + rttRequestWait);
            console.log('timeout:           ' + rttTimeout);
        }

        if (wsTestCase === 'download' || wsTestCase === 'upload')
        {

            if ((Number(wsWss) === 1) && wsTestCase === 'download' && !(typeof measurementParameters.ip_tls_overhead !== 'undefined' && Number(measurementParameters.ip_tls_overhead)))
            {
                iasMeasurementError = true;
                measurementError('TLS parameters missing', 8);
            } else
            {
                ip_tls_overhead = Number(measurementParameters.ip_tls_overhead);
            }

            console.log('target:            ' + wsWssString + wsTarget + ':' + wsTargetPort);
            console.log('protocol:          ' + wsProtocol);
            console.log('startup time:      ' + wsStartupTime);
            console.log('measurement time:  ' + (iasMeasurementRunningTime - wsAdditionalMeasurementRunningTime));
            console.log('parallel streams:  ' + wsParallelStreams);
            console.log('timeout:           ' + wsTimeout);
        }

        wsWorkers       = new Array(wsParallelStreams);
        wsWorkersStatus = new Array(wsParallelStreams);

        for (var wsID = 0; wsID < wsWorkers.length; wsID++)
        {
            if (wsTestCase === 'upload')
            {
                ulReportDict[wsID] = {};
            }

            var workerData = prepareWorkerData('connect', wsID);

            if (wsTestCase === 'rtt' && typeof require !== 'undefined')
            {
                workerData = prepareWorkerData('rtt_udp', wsID);
            }

            if (typeof require !== 'undefined')
            {
                const os = require('os');

                if (os.platform() === 'win32')
                {
                    os.setPriority(os.constants.priority.PRIORITY_HIGH);
                }

                var WorkerNode             = require("tiny-worker");
                var path                   = require('path');
                var ipcRendererMeasurement = require('electron').ipcRenderer;

                wsWorkersStatus[wsID] = wsStateClosed;
                wsWorkers[wsID]       = new WorkerNode(path.join(__dirname, './ias-client-js/worker.js'));

                ipcRendererMeasurement.send('measurementSetWorkerPID', wsWorkers[wsID].child.pid),

                workerData                = JSON.parse(workerData);
                workerData.ndServerFamily = measurementParameters.ndServerFamily;
                workerData                = JSON.stringify(workerData);
            } else
            {
                wsWorkersStatus[wsID] = wsStateClosed;
                wsWorkers[wsID]       = new Worker(wsWorkerPath);
            }

            wsWorkers[wsID].onmessage = function (event)
            {
                workerCallback(JSON.parse(event.data));
            };

            wsWorkers[wsID].postMessage(workerData);
        }

        wsTimeoutTimer = setTimeout(measurementTimeout, wsTimeout);
    };


    this.measurementStop = function (data)
    {
        clearInterval(wsTimeoutTimer);
        clearInterval(wsInterval);
        clearTimeout(wsStartupTimeout);

        console.log(wsTestCase + ': stopping measurement');

        if (typeof wsWorkers !== 'undefined')
        {
            var workerData = prepareWorkerData('close');

            for (var wsID = 0; wsID < wsWorkers.length; wsID++)
            {
                wsWorkers[wsID].postMessage(workerData);
            }
        }
    };


    this.workerCallback = function (data)
    {
        workerCallback(JSON.parse(data));
    };


    function workerCallback(data)
    {
        if (typeof data.wsState !== 'undefined')
        {
            wsWorkersStatus[data.wsID] = data.wsState;
        }

        switch (data.cmd)
        {
            case 'info': {
                if (logDebug)
                {
                    console.log('wsWorker ' + data.wsID + ' command: \'' + data.cmd + '\' message: \'' + data.msg);
                }
                break;
            }

            case 'open': {
                var allOpen = true;

                for (var wsWorkersStatusID = 0; wsWorkersStatusID < wsWorkersStatus.length; wsWorkersStatusID++)
                {
                    if (wsWorkersStatus[wsWorkersStatusID] !== wsStateOpen)
                    {
                        allOpen = false;
                    }
                }

                if (logDebug)
                {
                    console.log('wsWorker ' + data.wsID + ' socket open');
                }
                if (allOpen)
                {
                    if (logDebug)
                    {
                        console.log('all sockets open');
                    }

                    clearTimeout(wsTimeoutTimer);

                    if (wsTestCase === 'rtt')
                    {
                        measurementStart(true);
                        break;
                    }

                    if (wsTestCase === 'download')
                    {
                        wsStartupStartTime = performance.now() + 500;
                        wsStartupTimeout   = setTimeout(measurementStart, wsStartupTime + 500);


                        break;
                    } else
                    {
                        wsStartupStartTime = performance.now();
                        wsStartupTimeout   = setTimeout(measurementStart, wsStartupTime);
                        break;
                    }
                }
                break;
            }

            case 'close': {
                break;
            }

            case 'report': {
                if (wsTestCase === 'rtt')
                {
                    if (data.wsRttValues) wsRttValues = data.wsRttValues;

                    for (key in wsRttValues)
                    {
                        if (typeof wsRttValues[key] === 'undefined' || wsRttValues[key] === 'undefined' || wsRttValues[key] === null || wsRttValues[key] === 'null')
                        {
                            delete wsRttValues[key];
                        }
                    }

                    break;
                }

                if (data.msg === 'startupCompleted')
                {
                    wsFrameSize = data.wsFrameSize;

                    if (wsTestCase === 'download')
                    {
                        if (wsFrameSize >= 65536)
                        {
                            wsOverheadPerFrame                = 8;
                            dlWsOverheadPerFrame              = wsOverheadPerFrame;
                            wsDownloadValues.overheadPerFrame = wsOverheadPerFrame;
                        } else if (wsFrameSize < 126)
                        {
                            wsOverheadPerFrame                = 2;
                            dlWsOverheadPerFrame              = wsOverheadPerFrame;
                            wsDownloadValues.overheadPerFrame = wsOverheadPerFrame;
                        }

                        dlStartupData   += data.wsData;
                        dlStartupFrames += data.wsFrames;
                    }

                    break;
                } else if (wsTestCase === 'download' && wsWorkersStatus[data.wsID] === wsStateOpen)
                {
                    dlData   += data.wsData;
                    dlFrames += data.wsFrames;

                    if (data.wsTime > wsWorkerTime)
                    {
                        wsWorkerTime = data.wsTime;
                    }

                    break;
                } else if (wsTestCase === 'upload')
                {
                    ulReportDict[data.wsID] = data.ulReportDict;


                    if (timerIndexUploadFirst === 0 || data.timerIndexUploadFirst < timerIndexUploadFirst)
                    {
                        timerIndexUploadFirst = data.timerIndexUploadFirst;
                    }

                    break;
                }

                break;
            }

            case 'error': {
                if (data.msg === 'connection' && !iasMeasurementError && this.wsTestCase !== 'rtt')
                {
                    iasMeasurementError = true;
                    measurementError('no connection to measurement peer', 11);
                }
                break;
            }

            default: {
                console.log('wsWorker ' + data.wsID + ' unknown command: ' + data.cmd + '\' message: \'' + data.msg);
                break;
            }
        }
    }


    function measurementError(errorDescription, errorCode)
    {
        clearInterval(wsTimeoutTimer);

        if ((errorCode === 2) && wsTestCase === 'rtt')
        {
            iasMeasurementError = true;
            reportToMeasurement('info', 'no connection to measurement server');
            measurementFinish();
            return;
        }

        console.log(wsTestCase + ': ' + errorDescription);
        wsErrorCode        = errorCode;
        wsErrorDescription = errorDescription;
        reportToMeasurement('error', errorDescription);
        for (var wsID = 0; wsID < wsWorkers.length; wsID++)
        {
            var workerData = prepareWorkerData('close', wsID);

            wsWorkers[wsID].postMessage(workerData);
        }
        resetValues();
    }


    function measurementTimeout()
    {
        iasMeasurementError = true;
        measurementError('timeout error', 2);
    }


    function measurementStart()
    {
        wsStartTime = performance.now();

        if (wsTestCase !== 'rtt')
        {
            for (var wsID = 0; wsID < wsWorkers.length; wsID++)
            {
                if (wsWorkersStatus[wsID] === wsStateOpen) wsStreamsStart++;
                var workerData = prepareWorkerData('measurementStart', wsID);

                wsWorkers[wsID].postMessage(workerData);
            }
        }

        wsInterval = setInterval(measurementReport, wsReportInterval);

        console.log(wsTestCase + ': measurement started');
        reportToMeasurement('info', 'measurement started');
    }


    function measurementReport()
    {
        wsEndTime = performance.now();
        if (((wsEndTime - wsStartTime) > iasMeasurementRunningTime) || (wsRttValues.replies + wsRttValues.missing + wsRttValues.errors) === rttRequests)
        {
            clearInterval(wsInterval);
            wsCompleted = true;
            for (var wsID = 0; wsID < wsWorkers.length; wsID++)
            {
                if (wsWorkersStatus[wsID] === wsStateOpen) wsStreamsEnd++;
                var workerData = prepareWorkerData('close', wsID);

                wsWorkers[wsID].postMessage(workerData);
            }
            wsEndTime = performance.now();
            setTimeout(measurementFinish, 100);
        } else if ((wsEndTime - wsStartTime) > 500)
        {
            for (var wsID = 0; wsID < wsWorkers.length; wsID++)
            {

                var workerData = prepareWorkerData('report', wsID);

                wsWorkers[wsID].postMessage(workerData);
            }
            iasMeasurementTime      = performance.now() - wsStartTime;
            iasMeasurementTimeTotal = performance.now() - wsStartupStartTime;


            if (!wsCompleted)
            {
                setTimeout(report, 100);
            }
        }
    }


    function measurementFinish()
    {
        console.log(wsTestCase + ': measurement finished');

        iasMeasurementTime      = wsEndTime - wsStartTime;
        iasMeasurementTimeTotal = wsEndTime - wsStartupStartTime;
        report(true);
    }


    function report(finish)
    {
        if ((wsWorkerTime - wsStartTime) > iasMeasurementTime)
        {
            iasMeasurementTime      = wsWorkerTime - wsStartTime;
            iasMeasurementTimeTotal = wsWorkerTime - wsStartupStartTime;
        }

        var msg;

        if (wsTestCase !== 'rtt')
        {
            if (wsTestCase === 'download')
            {
                wsData        = dlData;
                wsFrames      = dlFrames;
                wsDataTotal   = dlData + dlStartupData;
                wsFramesTotal = dlFrames + dlStartupFrames;


                if (Number(wsWss) === 1)
                {
                    var SSL3_RT_MAX_PLAIN_LENGTH = 16384;
                        tlsOverhead              = parseInt(wsData * (SSL3_RT_MAX_PLAIN_LENGTH / (SSL3_RT_MAX_PLAIN_LENGTH - ip_tls_overhead)), 10) - wsData;
                        tlsOverheadTotal         = parseInt(wsDataTotal * (SSL3_RT_MAX_PLAIN_LENGTH / (SSL3_RT_MAX_PLAIN_LENGTH - ip_tls_overhead)), 10) - wsDataTotal;
                }
            } else if (wsTestCase === 'upload')
            {
                var ulData    = 0;
                var ulFrames  = 0;
                var ulReports = 0;


                wsIntermediates = [];


                var timerIndex = (iasMeasurementTimeTotal - (iasMeasurementTimeTotal % 500) - wsStartupTime) / 100;


                if (timerIndex > ((iasMeasurementRunningTime - wsAdditionalMeasurementRunningTime) / 1000) * 2 * 5)
                {
                    timerIndex = ((iasMeasurementRunningTime - wsAdditionalMeasurementRunningTime) / 1000) * 2 * 5;
                }


                timerIndex = timerIndex - 5;


                if (timerIndex < 0)
                {
                    timerIndex = 0;
                }


                var totalData   = 0;
                var totalFrames = 0;

                var aggregatedUlReportDict = [];


                for (var wsID = 0; wsID < wsWorkers.length; wsID++)
                {
                    var ulReportCount      = 0;
                    var ulStreamReportDict = ulReportDict[wsID];


                    for (var key in ulStreamReportDict)
                    {
                        totalData   += ulStreamReportDict[key].bRcv;
                        totalFrames += ulStreamReportDict[key].hRcv;

                        if (key >= timerIndexUploadFirst && key <= timerIndexUploadFirst + timerIndex)
                        {
                            ulData   += ulStreamReportDict[key].bRcv;
                            ulFrames += ulStreamReportDict[key].hRcv;


                            if (typeof aggregatedUlReportDict[ulReportCount] !== 'undefined')
                            {
                                aggregatedUlReportDict[ulReportCount].bRcv += ulStreamReportDict[key].bRcv;
                                aggregatedUlReportDict[ulReportCount].hRcv += ulStreamReportDict[key].hRcv;
                            } else
                            {
                                aggregatedUlReportDict[ulReportCount]      = {};
                                aggregatedUlReportDict[ulReportCount].bRcv = ulStreamReportDict[key].bRcv;
                                aggregatedUlReportDict[ulReportCount].hRcv = ulStreamReportDict[key].hRcv;
                            }


                            ulReportCount++;
                        }
                    }


                    if (ulReportCount > ulReports)
                    {
                        ulReports = ulReportCount;
                    }
                }

                wsData        = ulData;
                wsFrames      = ulFrames;
                wsDataTotal   = totalData;
                wsFramesTotal = totalFrames;

                iasMeasurementTime = ulReports * 500;


                for (var id in aggregatedUlReportDict)
                {
                    var wsIntermediate                   = {};
                        wsIntermediate.id                = Number(id) + 1;
                        wsIntermediate.duration_distinct = 500;
                        wsIntermediate.data_distinct     = aggregatedUlReportDict[id].bRcv + (aggregatedUlReportDict[id].hRcv * wsOverheadPerFrame);

                    wsIntermediates.push(wsIntermediate);
                }


            }


            wsSpeedAvgBitS  = 0;
            wsSpeedAvgMBitS = 0;
            wsSpeedMinBitS  = 0;
            wsSpeedMaxBitS  = 0;


            wsOverhead      = (wsFrames * wsOverheadPerFrame);
            wsOverheadTotal = (wsFramesTotal * wsOverheadPerFrame);

            wsSpeedAvgBitS  = (((wsData * 8) + (wsOverhead * 8) + (tlsOverhead * 8)) / (Math.round(iasMeasurementTime) / 1000));
            wsSpeedAvgMBitS = +(wsSpeedAvgBitS / 1000 / 1000).toFixed(2);


            var wsIntermediatesSum                   = {};
                wsIntermediatesSum.id                = 0;
                wsIntermediatesSum.duration_distinct = 0;
                wsIntermediatesSum.data_distinct     = 0;

            var zeroValue = false;

            for (var id in wsIntermediates)
            {
                wsIntermediatesSum.id                 = wsIntermediates[id].id;
                wsIntermediatesSum.duration_distinct += wsIntermediates[id].duration_distinct;
                wsIntermediatesSum.data_distinct     += wsIntermediates[id].data_distinct;


                var wsSpeedBits = (wsIntermediates[id].data_distinct * 8) / (wsIntermediates[id].duration_distinct / 1000);
                if (wsSpeedBits === 0)
                {
                    wsSpeedMinBitS = wsSpeedBits;
                    zeroValue      = true;
                }
                if ((wsSpeedBits < wsSpeedMinBitS) || (wsSpeedMinBitS === 0 && zeroValue === false))
                {
                    wsSpeedMinBitS = wsSpeedBits;
                }
                if (wsSpeedBits > wsSpeedMaxBitS)
                {
                    wsSpeedMaxBitS = wsSpeedBits;
                }
            }


            if ((wsTestCase === 'download') && (wsIntermediates.length + 1 <= ((iasMeasurementRunningTime - wsAdditionalMeasurementRunningTime) / 1000) * 2) && (Math.round(iasMeasurementTime) - wsIntermediatesSum.duration_distinct > 0))
            {
                var wsIntermediate                   = {};
                    wsIntermediate.id                = ++wsIntermediatesSum.id;
                    wsIntermediate.duration_distinct = Math.round(iasMeasurementTime) - wsIntermediatesSum.duration_distinct;
                    wsIntermediate.data_distinct     = (wsData + wsOverhead + tlsOverhead) - wsIntermediatesSum.data_distinct;

                wsIntermediates.push(wsIntermediate);


                var wsSpeedBits = (wsIntermediate.data_distinct * 8) / (wsIntermediate.duration_distinct / 1000);
                if (wsSpeedBits === 0)
                {
                    wsSpeedMinBitS = wsSpeedBits;
                    zeroValue      = true;
                }
                if ((wsSpeedBits < wsSpeedMinBitS) || (wsSpeedMinBitS === 0 && zeroValue === false))
                {
                    wsSpeedMinBitS = wsSpeedBits;
                }
                if (wsSpeedBits > wsSpeedMaxBitS)
                {
                    wsSpeedMaxBitS = wsSpeedBits;
                }
            }


            msg = 'ok';
        }

        var finishString = '';
        var cmd          = 'report';

        if (finish)
        {
            cmd          = 'finish';
            msg          = 'measurement finished';
            finishString = 'Overall ';
            console.log('--------------------------------------------------------');
        }

        var rttString = 'RTT ';

        if (typeof require !== 'undefined')
        {
            rttString = 'RTT UDP ';
        }

        if (logReports && wsTestCase === 'rtt')
        {
            console.log(finishString + 'Time:               ' + Math.round(iasMeasurementTime) + ' ms');
            console.log(finishString + rttString + 'Avg:        ' + wsRttValues.avg + ' ms');
            console.log(finishString + rttString + 'Median:     ' + wsRttValues.med + ' ms');
            console.log(finishString + rttString + 'Min:        ' + wsRttValues.min + ' ms');
            console.log(finishString + rttString + 'Max:        ' + wsRttValues.max + ' ms');
            console.log(finishString + rttString + 'Requests:   ' + wsRttValues.requests);
            console.log(finishString + rttString + 'Replies:    ' + wsRttValues.replies);
            console.log(finishString + rttString + 'Errors:     ' + wsRttValues.errors);
            console.log(finishString + rttString + 'Missing:    ' + wsRttValues.missing);
            console.log(finishString + rttString + 'Packet Size:' + wsRttValues.packet_size);
            console.log(finishString + rttString + 'Std Dev Pop:' + wsRttValues.stDevPop + ' ms');
        } else if (logReports)
        {
            console.log(finishString + 'Time:           ' + Math.round(iasMeasurementTime) + ' ms');
            console.log(finishString + 'Data:           ' + (wsData + wsOverhead + tlsOverhead) + ' bytes');
            console.log(finishString + 'TCP Goodput:    ' + wsSpeedAvgMBitS + ' Mbit/s');

            if (Number(wsWss) === 1)
            {
                console.log('Note: All Values account for Overhead added by TLS Framing');
            }
        }


        if (wsTestCase === 'download')
        {
            wsDownloadValues.rateAvg       = Math.round(wsSpeedAvgBitS);
            wsDownloadValues.rateMin       = Math.round(wsSpeedMinBitS);
            wsDownloadValues.rateMax       = Math.round(wsSpeedMaxBitS);
            wsDownloadValues.data          = wsData + wsOverhead + tlsOverhead;
            wsDownloadValues.dataTotal     = wsDataTotal + wsOverheadTotal + tlsOverheadTotal;
            wsDownloadValues.duration      = Math.round(iasMeasurementTime);
            wsDownloadValues.durationTotal = Math.round(iasMeasurementTimeTotal);
            wsDownloadValues.streamsStart  = wsStreamsStart;
            wsDownloadValues.streamsEnd    = wsStreamsEnd;
            wsDownloadValues.frameSize     = wsFrameSize;
            wsDownloadValues.frames        = wsFrames;
            wsDownloadValues.framesTotal   = wsFramesTotal;
            wsDownloadValues.overhead      = wsOverhead;
            wsDownloadValues.overheadTotal = wsOverheadTotal;
            wsDownloadValues.rateAvgMbps   = wsSpeedAvgMBitS;
            wsDownloadValues.intermediates = wsIntermediates;
        }

        if (wsTestCase === 'upload')
        {
            wsUploadValues.rateAvg       = Math.round(wsSpeedAvgBitS);
            wsUploadValues.rateMin       = Math.round(wsSpeedMinBitS);
            wsUploadValues.rateMax       = Math.round(wsSpeedMaxBitS);
            wsUploadValues.data          = wsData + wsOverhead;
            wsUploadValues.dataTotal     = wsDataTotal + wsOverheadTotal;
            wsUploadValues.duration      = Math.round(iasMeasurementTime);
            wsUploadValues.durationTotal = Math.round(iasMeasurementTimeTotal);
            wsUploadValues.streamsStart  = wsStreamsStart;
            wsUploadValues.streamsEnd    = wsStreamsEnd;
            wsUploadValues.frameSize     = wsFrameSize;
            wsUploadValues.frames        = wsFrames;
            wsUploadValues.framesTotal   = wsFramesTotal;
            wsUploadValues.overhead      = wsOverhead;
            wsUploadValues.overheadTotal = wsOverheadTotal;
            wsUploadValues.rateAvgMbps   = wsSpeedAvgMBitS;
            wsUploadValues.intermediates = wsIntermediates;
        }

        reportToMeasurement(cmd, msg);
        if (finish) resetValues();
    }


    function reportToMeasurement(cmd, msg)
    {
        var report           = {};
            report.cmd       = cmd;
            report.msg       = msg;
            report.test_case = wsTestCase;

        if (wsTestCase === 'rtt') report      = getKPIsRtt(report);
        if (wsTestCase === 'download') report = getKPIsDownload(report);
        if (wsTestCase === 'upload') report   = getKPIsUpload(report);
           report                             = getKPIsAvailability(report);

        if (typeof control !== 'undefined' && control !== null && control !== 'null' && control.callback === 'iasMeasurement') this.iasMeasurement.controlCallback(JSON.stringify(report));
    }


    function getKPIsRtt(report)
    {
        if (typeof require !== 'undefined')
        {
            report.rtt_udp_avg         = Number(wsRttValues.avg);
            report.rtt_udp_med         = Number(wsRttValues.med);
            report.rtt_udp_min         = Number(wsRttValues.min);
            report.rtt_udp_max         = Number(wsRttValues.max);
            report.rtt_udp_requests    = Number(wsRttValues.requests);
            report.rtt_udp_replies     = Number(wsRttValues.replies);
            report.rtt_udp_errors      = Number(wsRttValues.errors);
            report.rtt_udp_missing     = Number(wsRttValues.missing);
            report.rtt_udp_packet_size = Number(wsRttValues.packet_size);
            report.rtt_udp_std_dev_pop = Number(wsRttValues.stDevPop);
        } else
        {
            report.rtt_avg         = Number(wsRttValues.avg);
            report.rtt_med         = Number(wsRttValues.med);
            report.rtt_min         = Number(wsRttValues.min);
            report.rtt_max         = Number(wsRttValues.max);
            report.rtt_requests    = Number(wsRttValues.requests);
            report.rtt_replies     = Number(wsRttValues.replies);
            report.rtt_errors      = Number(wsRttValues.errors);
            report.rtt_missing     = Number(wsRttValues.missing);
            report.rtt_packet_size = Number(wsRttValues.packet_size);
            report.rtt_std_dev_pop = Number(wsRttValues.stDevPop);
        }

        return report;
    }


    function getKPIsDownload(report)
    {
        report.download_rate_avg           = wsDownloadValues.rateAvg;
        report.download_rate_min           = wsDownloadValues.rateMin;
        report.download_rate_max           = wsDownloadValues.rateMax;
        report.download_data               = wsDownloadValues.data;
        report.download_data_total         = wsDownloadValues.dataTotal;
        report.download_duration           = wsDownloadValues.duration;
        report.download_duration_total     = wsDownloadValues.durationTotal;
        report.download_streams_start      = wsDownloadValues.streamsStart;
        report.download_streams_end        = wsDownloadValues.streamsEnd;
        report.download_frame_size         = wsDownloadValues.frameSize;
        report.download_frames             = wsDownloadValues.frames;
        report.download_frames_total       = wsDownloadValues.framesTotal;
        report.download_overhead           = wsDownloadValues.overhead;
        report.download_overhead_total     = wsDownloadValues.overheadTotal;
        report.download_overhead_per_frame = wsDownloadValues.overheadPerFrame;
        report.download_rate_avg_mbps      = wsDownloadValues.rateAvgMbps;
        report.download_intermediates      = JSON.stringify(wsDownloadValues.intermediates);

        return report;
    }


    function getKPIsUpload(report)
    {
        report.upload_rate_avg           = wsUploadValues.rateAvg;
        report.upload_rate_min           = wsUploadValues.rateMin;
        report.upload_rate_max           = wsUploadValues.rateMax;
        report.upload_data               = wsUploadValues.data;
        report.upload_data_total         = wsUploadValues.dataTotal;
        report.upload_duration           = wsUploadValues.duration;
        report.upload_duration_total     = wsUploadValues.durationTotal;
        report.upload_streams_start      = wsUploadValues.streamsStart;
        report.upload_streams_end        = wsUploadValues.streamsEnd;
        report.upload_frame_size         = wsUploadValues.frameSize;
        report.upload_frames             = wsUploadValues.frames;
        report.upload_frames_total       = wsUploadValues.framesTotal;
        report.upload_overhead           = wsUploadValues.overhead;
        report.upload_overhead_total     = wsUploadValues.overheadTotal;
        report.upload_overhead_per_frame = wsUploadValues.overheadPerFrame;
        report.upload_rate_avg_mbps      = wsUploadValues.rateAvgMbps;
        report.upload_intermediates      = JSON.stringify(wsUploadValues.intermediates);

        return report;
    }


    function getKPIsAvailability(report)
    {
        report.error_code        = wsErrorCode;
        report.error_description = wsErrorDescription;

        return report;
    }


    function prepareWorkerData(cmd, wsID)
    {
        var workerData                           = {};
            workerData.cmd                       = cmd;
            workerData.wsTestCase                = wsTestCase;
            workerData.wsID                      = wsID;
            workerData.wsTarget                  = wsTarget;
            workerData.wsTargetPort              = wsTargetPort;
            workerData.wsWss                     = wsWss;
            workerData.wsProtocol                = wsProtocol;
            workerData.wsFrameSize               = wsFrameSize;
            workerData.htPostPath                = htPostPath;
            workerData.wsTLD                     = wsTLD;
            workerData.iasMeasurementRunningTime = iasMeasurementRunningTime;

        if (wsTestCase === 'rtt')
        {
            workerData.rttRequests       = rttRequests;
            workerData.rttRequestTimeout = rttRequestTimeout;
            workerData.rttRequestWait    = rttRequestWait;
            workerData.rttTimeout        = rttTimeout;
            workerData.rttPayloadSize    = rttPayloadSize;
        }

        return JSON.stringify(workerData);
    }


    function resetValues()
    {
        clearInterval(wsInterval);

        wsTestCase                         = '';
        wsData                             = 0;
        wsDataTotal                        = 0;
        wsFrames                           = 0;
        wsFramesTotal                      = 0;
        wsSpeedAvgBitS                     = 0;
        wsSpeedAvgMBitS                    = 0;
        wsSpeedMinBitS                     = 0;
        wsSpeedMaxBitS                     = 0;
        wsOverhead                         = 0;
        wsOverheadTotal                    = 0;
        wsStartTime                        = performance.now();
        wsEndTime                          = performance.now();
        iasMeasurementTime                 = 0;
        iasMeasurementTimeTotal            = 0;
        wsStartupStartTime                 = performance.now();
        wsOverheadPerFrame                 = 0;
        wsWorkers                          = 0;
        wsWorkersStatus                    = 0;
        wsWorkerTime                       = 0;
        wsInterval                         = 0;
        iasMeasurementRunningTime          = 0;
        wsAdditionalMeasurementRunningTime = 0;
        wsCompleted                        = false;
        wsReportInterval                   = 0;
        wsTimeoutTimer                     = 0;
        wsTimeout                          = 0;
        wsStartupTimeout                   = 0;
        wsStreamsStart                     = 0;
        wsStreamsEnd                       = 0;
        wsFrameSize                        = 0;

        tlsOverhead      = 0;
        tlsOverheadTotal = 0;

        dlData          = 0;
        dlFrames        = 0;
        dlStartupData   = 0;
        dlStartupFrames = 0;

        ulReportDict          = {};
        ulStartupData         = 0;
        ulStartupFrames       = 0;
        timerIndexUploadFirst = 0;

        wsIntermediates = [];
    }
};
