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

var jsTool = new JSTool();
jsTool.enableLoggger(logEnabled);


function Ip()
{
    this.iasMeasurement = '';

    var wsWorker;
    var wsWorkerStatus;
    var wsTestCase = 'ip';

    var wsIpProtocol = 'ip';

    var wsStateConnecting = 0;
    var wsStateOpen       = 1;
    var wsStateClosing    = 2;
    var wsStateClosed     = 3;

    var cmd = '';
    var msg = '';

    var wsTimeoutTimer;


    var wsTarget;
    var wsTLD;
    var wsTimeout    = 15000;
    var wsWorkerPath = 'worker.js';

    var measurementParameters;


    var wsErrorCode;
    var wsErrorDescription;

    var wsIpValues = 
    {
        client        : undefined,
        tlsVersion    : undefined,
        tlsCipherSuite: undefined,
        tlsOverhead   : undefined,
        targetPort    : undefined,
        wss           : undefined,
        ip_version    : undefined
    };


    this.performIp = function (iasMeasurementParameters)
    {
        measurementParameters = iasMeasurementParameters;

        measurementParameters = JSON.parse(measurementParameters);

        if (typeof measurementParameters.wsTargetPort !== 'undefined') wsIpValues.targetPort = String(measurementParameters.wsTargetPort);
        if (typeof measurementParameters.wsWss !== 'undefined') wsIpValues.wss               = String(measurementParameters.wsWss);

        if (typeof measurementParameters.wsTarget !== 'undefined') wsTarget         = String(measurementParameters.wsTarget);
        if (typeof measurementParameters.wsTLD !== 'undefined') wsTLD               = String(measurementParameters.wsTLD);
        if (typeof measurementParameters.wsTimeout !== 'undefined') wsTimeout       = Number(measurementParameters.wsTimeout);
        if (typeof measurementParameters.wsWorkerPath !== 'undefined') wsWorkerPath = String(measurementParameters.wsWorkerPath);

        start(measurementParameters);
    };


    this.measurementStop = function (data)
    {
        clearInterval(wsTimeoutTimer);

        console.log(wsTestCase + ': stopping measurement');

        if (typeof wsWorker !== 'undefined' && typeof wsWorker.postMessage !== 'undefined')
        {
            var workerData = prepareWorkerData('close');

            wsWorker.postMessage(workerData);
        }
    };


    this.workerCallback = function (data)
    {
        workerCallback(JSON.parse(data));
    };


    function start(measurementParameters)
    {
        var workerData = {};
            workerData = prepareWorkerData('ip');

        wsTimeoutTimer = setTimeout(measurementTimeout, wsTimeout);

        wsWorkerStatus = wsStateClosed;
        wsWorker       = new Worker(wsWorkerPath);

        wsWorker.onmessage = function (event)
        {
            workerCallback(JSON.parse(event.data));
        };

        wsWorker.postMessage(workerData);
    }


    function workerCallback(data)
    {
        switch (data.cmd)
        {
            case 'info': {
                wsWorkerStatus = data.wsState;
                if (logDebug)
                {
                    console.log('wsWorker ' + data.wsID + ' command: \'' + data.cmd + '\' message: \'' + data.msg);
                }
                break;
            }

            case 'open': {
                wsWorkerStatus = data.wsState;

                if (logDebug)
                {
                    console.log('wsWorker ' + data.wsID + ' websocket open');
                }
                break;
            }

            case 'close': {
                wsWorkerStatus = data.wsState;
                ;
                break;
            }

            case 'report': {
                wsWorkerStatus = data.wsState;

                if (wsTestCase === 'ip')
                {
                    if (data.msg === 'ok')
                    {
                        wsIpValues = jsTool.extend(wsIpValues, data.wsIpValues);

                        for (key in wsIpValues)
                        {
                            if (typeof wsIpValues[key] === 'undefined' || wsIpValues[key] === 'undefined' || wsIpValues[key] === null || wsIpValues[key] === 'null')
                            {
                                delete wsIpValues[key];
                            }
                        }

                        if (wsIpValues.client)
                        {
                            setClientAddress(wsIpValues.client);
                        }

                        cmd = 'finish';
                        msg = data.msg;
                        report();

                        break;
                    }
                }
                break;
            }

            case 'error': {
                wsWorkerStatus = data.wsState;

                if (data.msg === 'connection')
                {
                    measurementError('no connection to measurement peer', 11);
                } else measurementError('unknown error', 5);
                break;
            }

            default: {
                console.log('wsWorker ' + data.wsID + ' unknown command: ' + data.cmd + '\' message: \'' + data.msg);
                break;
            }
        }
    }


    function report()
    {
        clearInterval(wsTimeoutTimer);
        reportToMeasurement(cmd, msg);
    }


    function prepareWorkerData(cmd)
    {
        var workerData = {};

        workerData.cmd          = cmd;
        workerData.wsTestCase   = wsTestCase;
        workerData.wsTarget     = wsTarget + '.' + wsTLD;
        workerData.wsTargetPort = wsIpValues.targetPort;
        workerData.wsWss        = wsIpValues.wss;
        workerData.wsProtocol   = wsIpProtocol;
        workerData.wsTLD        = wsTLD;

        return JSON.stringify(workerData);
    }


    function measurementError(errorDescription, errorCode)
    {
        clearInterval(wsTimeoutTimer);
        console.log(wsTestCase + ': ' + errorDescription);
        wsErrorCode        = errorCode;
        wsErrorDescription = errorDescription;
        reportToMeasurement('error', errorDescription);
    }


    function measurementTimeout()
    {
        measurementError('timeout error', 2);
    }


    function reportToMeasurement(cmd, msg)
    {
        var report           = {};
            report.cmd       = cmd;
            report.msg       = msg;
            report.test_case = 'ip';

        report = getKPIsIp(report);
        report = getKPIsAvailability(report);

        console.log('--------------------------------------------------------');
        console.log('ip results:');
        console.log('tls version:                       ' + wsIpValues.tlsVersion);
        console.log('tls cipher suite:                  ' + wsIpValues.tlsCipherSuite);
        console.log('tls overhead:                      ' + wsIpValues.tlsOverhead);
        console.log('server tls:                        ' + wsIpValues.wss);
        console.log('client:                            ' + wsIpValues.client);
        console.log('ip version:                        ' + wsIpValues.ip_version);

        this.iasMeasurement.controlCallback(JSON.stringify(report));
    }


    function getKPIsIp(report)
    {
        report.ip_tls_version      = wsIpValues.tlsVersion;
        report.ip_tls_cipher_suite = wsIpValues.tlsCipherSuite;
        report.ip_tls_overhead     = wsIpValues.tlsOverhead;
        report.client              = wsIpValues.client;
        report.ip_version          = wsIpValues.ip_version;
        report.server_tls          = Number(wsIpValues.wss);

        return report;
    }


    function getKPIsAvailability(report)
    {
        report.error_code        = wsErrorCode;
        report.error_description = wsErrorDescription;

        return report;
    }


    function setClientAddress(client)
    {
        if (jsTool.getIPAddressType(client) === 'IPv6')
        {
            wsIpValues.ip_version = 'v6';
        } else
        {
            wsIpValues.ip_version = 'v4';
        }
    }
}
