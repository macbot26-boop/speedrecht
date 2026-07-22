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
var logReports = true;
var logDebug   = true;


var JSTool = function ()
{

    this.iasMeasurement = '';
    this.localIPs       = '-';

    return (this);
};

var htPostTool;


JSTool.prototype.getDeviceKPIs = function (platform)
{
    var jsDate;
    var jsTimezone;

    var jsClientOS;
    var jsClientOSVersion;
    var jsClientBrowser;
    var jsClientBrowserVersion;

    jsDate     = this.getFormattedDate();
    jsTimezone = this.getTimezone();

    var browserReport                                          = this.getBrowserReport();
    if  (browserReport.browser.name) jsClientBrowser           = browserReport.browser.name + ' ' + browserReport.browser.version;
    if  (browserReport.browser.version) jsClientBrowserVersion = browserReport.browser.version;
    if  (browserReport.os.name) jsClientOS                     = browserReport.os.name;
    if  (browserReport.os.version) jsClientOSVersion           = browserReport.os.version;

    var deviceKPIs = 
    {
        date                  : jsDate,
        timezone              : jsTimezone,
        client_browser        : jsClientBrowser,
        client_browser_version: jsClientBrowserVersion,
        client_os             : jsClientOS,
        client_os_version     : jsClientOSVersion
    };

    console.log('device kpis:');
    console.log('date:                  ' + deviceKPIs.date);
    console.log('timezone:              ' + deviceKPIs.timezone);
    console.log('client browser:        ' + deviceKPIs.client_browser);
    console.log('client os:             ' + deviceKPIs.client_os);
    console.log('client os version:     ' + deviceKPIs.client_os_version);

    return JSON.stringify(deviceKPIs);
};


JSTool.prototype.generateRandomData = function (length, asString)
{
    var mask  = '';
        mask += 'abcdefghijklmnopqrstuvwxyz';
        mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        mask += '0123456789';
        mask += '~`!@#$%^&*()_+-={}[]:\';"<>?,./|\\';
    var data = '';
    for (var i = length; i > 0; --i)
    {
        data += mask[Math.floor(Math.random() * mask.length)];
    }
    if (asString) return data;
    else return new Blob([data]);
};


JSTool.prototype.getIPAddressType = function (ip)
{
    if (/^\s*((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))\s*$/g.test(ip))
    {
        return 'IPv4';
    }

    if (/^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/g.test(ip))
    {
        return 'IPv6';
    }

    return false;
};


JSTool.prototype.getTimestamp = function ()
{
    if (!Date.now)
    {
        Date.now = function ()
        {
            return new Date().getTime();
        };
    }

    return Date.now();
};


JSTool.prototype.getFormattedDate = function ()
{
    var date = new Date();
    var formattedDate;
    formattedDate = date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2) + ' ' + ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2) + ':' + ('0' + date.getSeconds()).slice(-2);

    return formattedDate;
};


JSTool.prototype.getTimezone = function ()
{
    var    date    = new Date();
    var    offset  = date.getTimezoneOffset();
    return offset *= -60;
};


JSTool.prototype.webSocketCloseReasons = function (event)
{
    switch (event.code)
    {
        case 1000: 
            return 'Normal closure, meaning that the purpose for which the connection was established has been fulfilled.';
            break;
        case 1001: 
            return 'An endpoint is \"going away\", such as a server going down or a browser having navigated away from a page.';
            break;
        case 1002: 
            return 'An endpoint is terminating the connection due to a protocol error';
            break;
        case 1003: 
            return 'An endpoint is terminating the connection because it has received a type of data it cannot accept (e.g., an endpoint that understands only text data MAY send this if it receives a binary message).';
            break;
        case 1004: 
            return 'Reserved. The specific meaning might be defined in the future.';
            break;
        case 1005: 
            return 'No status code was actually present.';
            break;
        case 1006: 
            return 'The connection was closed abnormally, e.g., without sending or receiving a Close control frame';
            break;
        case 1007: 
            return 'An endpoint is terminating the connection because it has received data within a message that was not consistent with the type of the message (e.g., non-UTF-8 [http://tools.ietf.org/html/rfc3629] data within a text message).';
            break;
        case 1008: 
            return 'An endpoint is terminating the connection because it has received a message that \'violates its policy\'. This reason is given either if there is no other sutible reason, or if there is a need to hide specific details about the policy.';
            break;
        case 1009: 
            return 'An endpoint is terminating the connection because it has received a message that is too big for it to process.';
            break;
        case 1010: 
            return 'An endpoint (client) is terminating the connection because it has expected the server to negotiate one or more extension, but the server didn\'t return them in the response message of the WebSocket handshake. <br /> Specifically, the extensions that are needed are: ' + event.reason;
            break;
        case 1011: 
            return 'A server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request.';
            break;
        case 1015: 
            return 'The connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can\'t be verified).';
            break;
        default: 
            return 'Unknown reason';
            break;
    }
};


JSTool.prototype.getBrowserReport = function ()
{
    var uaparser = UAParser();
    return uaparser;
};


JSTool.prototype.enableLoggger = function (enable)
{
    var old_console_log = console.log;
        console.log     = function ()
    {
        if (enable && typeof old_console_log !== 'undefined' && typeof old_console_log.apply !== 'undefined')
        {
            old_console_log.apply(this, arguments);
        }
    };
};

console.logCopy = console.log.bind(console);


console.log = function ()
{
    var timestamp = new Date().toJSON();

    if (arguments.length)
    {
        var args = Array.prototype.slice.call(arguments, 0);

        if (typeof arguments[0] === 'string')
        {
            args[0] = '%o: ' + arguments[0];

            args.splice(1, 0, timestamp);

            if (typeof this.logCopy !== 'undefined' && typeof this.logCopy === 'function' && typeof this.logCopy.apply !== 'undefined')
            {

                this.logCopy.apply(this, args);
            }
        } else if (typeof this.logCopy === 'function')
        {

            this.logCopy(timestamp, args);
        }
    }
};


JSTool.prototype.extend = function ()
{
    var extended = {};
    var length   = arguments.length;

    var merge = function (obj)
    {
        for (var prop in obj)
        {
            if (Object.prototype.hasOwnProperty.call(obj, prop))
            {
                extended[prop] = obj[prop];
            }
        }
    };

    for (var i = 0; i < length; i++)
    {
        var obj = arguments[i];
        merge(obj);
    }

    return extended;
};

JSTool.prototype.performRouteToClientLookup = function (target, port)
{
    htPostTool = null;
    htPostTool = new HTPost();
    htPostTool.setURL('https://' + target + ':' + port);
    htPostTool.setValues(JSON.stringify({ cmd: 'traceroute' }));
    htPostTool.setContentType('application/json');
    htPostTool.setTimeout(15000);
    htPostTool.setMaxTries(1);
    htPostTool.executeRequest();
};


function htPostCallbackTool(data)
{
    try
    {
        data = JSON.parse(data);
    } catch (e)
    {
        return;
    }

    if (typeof data.hops !== 'undefined')
    {
        reportRouteToClientToMeasurement(data);
    }
}

function reportRouteToClientToMeasurement(data)
{
    var report           = {};
        report.cmd       = 'report';
        report.msg       = '';
        report.test_case = 'routeToClient';

    try
    {
        data.hops.splice(data.hops.length - 2, 2);
    } catch (e)
    {
        data.hops = [];
    }

    try
    {
        report.server_client_route_hops = Number(data.hops[data.hops.length - 1].id);
    } catch (error)
    {
        report.server_client_route_hops = 0;
    }

    report.server_client_route = JSON.stringify(data.hops);

    if (typeof getRouteToClientCallback !== 'undefined')
    {
        getRouteToClientCallback(JSON.stringify(report));
    } else if (typeof this.iasMeasurement !== 'undefined')
    {
        this.iasMeasurement.controlCallback(JSON.stringify(report));
    }
}