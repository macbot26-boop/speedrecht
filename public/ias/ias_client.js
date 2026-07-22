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

var ip;
var control;
var jsTool = new JSTool();


function IASMeasurement()
{

    var iasVersion = '2.4';

    var platform;

    var performedIp = false;


    var performRttMeasurement      = false;
    var performDownloadMeasurement = false;
    var performUploadMeasurement   = false;

    var performedRttMeasurement      = false;
    var performedDownloadMeasurement = false;
    var performedUploadMeasurement   = false;

    var performRouteToClientLookup   = false;
    var performedRouteToClientLookup = false;
    var routeToClientTargetPort      = '8443';

    var iasMeasurementParameters = {};


    var deviceKPIs       = {};
    var availabilityKPIs = {};
    var ipKPIs           = {};
    var rttKPIs          = {};
    var downloadKPIs     = {};
    var uploadKPIs       = {};
    var routeKPIs        = {};

    var wsRttTimer      = 0;
    var wsDownloadTimer = 0;
    var wsUploadTimer   = 0;

    var measurementStopped = false;


    this.measurementControl = function (measurementParameters)
    {
        iasMeasurementParameters = JSON.parse(measurementParameters);

        if ((iasMeasurementParameters.cmd) === 'start')
        {
            resetIp();
            resetControl();

            if (typeof iasMeasurementParameters.platform !== 'undefined') platform = String(iasMeasurementParameters.platform);

            deviceKPIs                    = JSON.parse(jsTool.getDeviceKPIs(platform));
            deviceKPIs.client_ias_version = iasVersion;


            if ((deviceKPIs.client_browser.search('Safari 5') !== -1) || (deviceKPIs.client_browser.search('Safari 6') !== -1) || (deviceKPIs.client_browser.search('Safari 7') !== -1) || (deviceKPIs.client_browser.search('Internet Explorer 11') !== -1) || ((deviceKPIs.client_browser.search('Firefox') !== -1) && (Number(deviceKPIs.client_browser_version) < 38)) || ((deviceKPIs.client_browser.search('Edge') !== -1) && (Number(deviceKPIs.client_browser_version) < 15)))
            {
                var data                               = {};
                    data.cmd                           = 'error';
                    availabilityKPIs.error_code        = 5;
                    availabilityKPIs.error_description = 'WebSockets are only partially supported by your browser';
                    data                               = JSON.stringify(data);
                this.controlCallback(data);
                return;
            }
        }

        if (typeof iasMeasurementParameters.performRttMeasurement !== 'undefined') performRttMeasurement           = Boolean(iasMeasurementParameters.performRttMeasurement);
        if (typeof iasMeasurementParameters.performDownloadMeasurement !== 'undefined') performDownloadMeasurement = Boolean(iasMeasurementParameters.performDownloadMeasurement);
        if (typeof iasMeasurementParameters.performUploadMeasurement !== 'undefined') performUploadMeasurement     = Boolean(iasMeasurementParameters.performUploadMeasurement);
        if (typeof iasMeasurementParameters.performRouteToClientLookup !== 'undefined') performRouteToClientLookup = Boolean(iasMeasurementParameters.performRouteToClientLookup);
        if (typeof iasMeasurementParameters.routeToClientTargetPort !== 'undefined') routeToClientTargetPort       = Number(iasMeasurementParameters.routeToClientTargetPort);

        var random                            = Math.floor(Math.random() * iasMeasurementParameters.wsTargets.length);
            iasMeasurementParameters.wsTarget = iasMeasurementParameters.wsTargets[random];

        if (typeof window !== 'undefined' && !window.WebSocket)
        {
            var data                               = {};
                data.cmd                           = 'error';
                availabilityKPIs.error_code        = 3;
                availabilityKPIs.error_description = 'WebSockets are not supported by your browser';
                data                               = JSON.stringify(data);
            this.controlCallback(data);
            return;
        }

        if (!iasMeasurementParameters.cmd || !platform || !iasMeasurementParameters.wsTLD || (!performRttMeasurement && !performDownloadMeasurement && !performUploadMeasurement))
        {
            var data                               = {};
                data.cmd                           = 'error';
                availabilityKPIs.error_code        = 1;
                availabilityKPIs.error_description = 'Measurement Parameters Missing';
                data                               = JSON.stringify(data);
            this.controlCallback(data);
            return;
        }

        switch (iasMeasurementParameters.cmd)
        {
            case 'start': {
                measurementCampaign();

                break;
            }
            case 'stop': {
                measurementStopped = true;

                clearTimeout(wsRttTimer);
                clearTimeout(wsDownloadTimer);
                clearTimeout(wsUploadTimer);

                if (ip) ip.measurementStop(JSON.stringify(iasMeasurementParameters));
                if (control) control.measurementStop(JSON.stringify(iasMeasurementParameters));

                break;
            }
        }
    };


    this.controlCallback = function (data)
    {
        data = JSON.parse(data);

        if (data.test_case === 'routeToClient')
        {
            routeKPIs.server_client_route      = data.server_client_route;
            routeKPIs.server_client_route_hops = data.server_client_route_hops;
        }

        if (data.test_case === 'ip') ipKPIs             = jsTool.extend(ipKPIs, data);
        if (data.test_case === 'rtt') rttKPIs           = data;
        if (data.test_case === 'download') downloadKPIs = data;
        if (data.test_case === 'upload') uploadKPIs     = data;

        if (data.cmd === 'error')
        {
            if (data.test_case === 'ip') performedIp = true;
            setTimeout(resetIp, 200);
            setTimeout(resetControl, 200);
        }

        if (data.cmd === 'finish')
        {
            if (data.test_case === 'ip')
            {
                performedIp = true;

                ip = null;
                delete ip;
            }

            if (data.test_case === 'rtt')
            {
                performedRttMeasurement = true;
            }

            if (data.test_case === 'download')
            {
                performedDownloadMeasurement = true;
            }

            if (data.test_case === 'upload')
            {
                performedUploadMeasurement = true;
            }

            measurementCampaign();
        }

        var kpis = getKPIs();

        if (performedIp && performRttMeasurement === performedRttMeasurement && performDownloadMeasurement === performedDownloadMeasurement && performUploadMeasurement === performedUploadMeasurement)
        {
            var kpisCompleted     = jsTool.extend(kpis);
                kpisCompleted.cmd = 'completed';
                kpisCompleted     = JSON.stringify(kpisCompleted);
            setTimeout(controlCallbackToPlatform, 50, kpisCompleted);
        }

        if (typeof kpis.error_code !== 'undefined' && kpis.error_code !== 0)
        {
            kpis.cmd = 'error';
            kpis.msg = 'error';
        }

        kpis = JSON.stringify(kpis);

        controlCallbackToPlatform(kpis);
    };


    this.setDeviceKPIs = function (data)
    {
        data       = JSON.parse(data);
        deviceKPIs = jsTool.extend(deviceKPIs, data);

    };


    function controlCallbackToPlatform(kpis)
    {
        reportToWeb(kpis);
    }


    function measurementCampaign()
    {
        if (measurementStopped)
        {
            return;
        }

        if (!performedIp)
        {
            ip                = null;
            ip                = new Ip();
            ip.iasMeasurement = this;
            ip.performIp(JSON.stringify(iasMeasurementParameters));

            return;
        }

        control = null;
        delete control;
        control                = new Control();
        control.iasMeasurement = this;
        control.callback       = 'iasMeasurement';

        var waitTime      = 3000;
        var waitTimeShort = 1000;

        if (typeof require !== 'undefined')
        {
            if (typeof ipKPIs.ip_version !== 'undefined' && ipKPIs.ip_version === 'v6')
            {
                iasMeasurementParameters.ndServerFamily = 6;
            } else
            {
                iasMeasurementParameters.ndServerFamily = 4;
            }
        }

        if (performRttMeasurement && !performedRttMeasurement)
        {
            iasMeasurementParameters.testCase = 'rtt';
            wsRttTimer                        = setTimeout(control.measurementSetup, waitTimeShort, JSON.stringify(iasMeasurementParameters));

            return;
        }

        if (performRouteToClientLookup && !performedRouteToClientLookup && (performDownloadMeasurement || performUploadMeasurement))
        {
            jsTool.performRouteToClientLookup(iasMeasurementParameters.wsTarget + '.' + iasMeasurementParameters.wsTLD, routeToClientTargetPort);
            performedRouteToClientLookup = true;
        }


        if (typeof ipKPIs.server_tls !== 'undefined' && Number(ipKPIs.server_tls) === 1 && typeof ipKPIs.ip_tls_overhead !== 'undefined' && Number(ipKPIs.ip_tls_overhead))
        {
            iasMeasurementParameters.ip_tls_overhead = ipKPIs.ip_tls_overhead;
        }

        if (performDownloadMeasurement && !performedDownloadMeasurement)
        {
            var waitTimeDownload = waitTimeShort;

            iasMeasurementParameters.testCase = 'download';
            wsDownloadTimer                   = setTimeout(control.measurementSetup, waitTimeDownload, JSON.stringify(iasMeasurementParameters));

            return;
        } else if (performUploadMeasurement && !performedUploadMeasurement)
        {
            iasMeasurementParameters.testCase = 'upload';
            wsUploadTimer                     = setTimeout(control.measurementSetup, waitTime, JSON.stringify(iasMeasurementParameters));

            return;
        } else setTimeout(resetControl, 200);
    }


    function getKPIs()
    {
        var kpis = jsTool.extend(availabilityKPIs, ipKPIs, rttKPIs, downloadKPIs, uploadKPIs, deviceKPIs, routeKPIs);

        return kpis;
    }


    function resetIp()
    {
        ip = null;
        delete ip;
    }


    function resetControl()
    {
        control = null;
        delete control;
    }


    function reportToWeb(kpis)
    {
        measurementCallback(kpis);
    }
}