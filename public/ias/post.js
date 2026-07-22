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

function HTPost()
{
    var htURL     = '';
    var htValues  = {};
    var htTimeout = 2000;
    var htContentType;
    var htTriesCounter = 0;
    var htTriesMax     = 1;


    this.setURL = function (url)
    {
        htURL = url;
    };

    this.setValues = function (values, cleanKeys)
    {
        htValues = JSON.parse(values);

        if (cleanKeys)
        {
            delete htValues.cmd;
            delete htValues.msg;
            delete htValues.test_case;
            delete htValues.platform;
            delete htValues.download_rate_avg_mbps;
            delete htValues.upload_rate_avg_mbps;
            delete htValues.client_browser_version;
        }
    };

    this.setContentType = function (contentType)
    {
        htContentType = contentType;
    };

    this.setTimeout = function (timeout)
    {
        htTimeout = timeout;
    };

    this.setMaxTries = function (maxTries)
    {
        htTriesMax = maxTries;
    };

    this.executeRequest = function ()
    {
        post();
    };


    function post()
    {
        if (htTriesCounter < htTriesMax)
        {
            var xhr = createCORSRequest('POST', htURL);
            if (xhr)
            {
                if (htContentType) xhr.setRequestHeader('Content-Type', htContentType);
                xhr.send(JSON.stringify(htValues));
                htTriesCounter++;
            } else
            {
                post();
                htTriesCounter++;
            }
        }
    }

    function createCORSRequest(method, url)
    {
        var xhr = new XMLHttpRequest();
        if ('withCredentials' in xhr)
        {
            xhr.open(method, url, true);
        } else if (typeof XDomainRequest !== 'undefined')
        {
            xhr = new XDomainRequest();
            xhr.open(method, url);
        } else
        {
            delete xhr;
            post();
        }

        xhr.onload = function ()
        {
            if (xhr.readyState === 4 && xhr.status === 200)
            {
                if (htPostTool) htPostCallbackTool(xhr.responseText, 0);
                delete xhr;
            } else
            {
                delete xhr;
                post();
            }
        };

        xhr.ontimeout = function ()
        {
            delete xhr;
            post();
        };

        xhr.onerror = function ()
        {
            delete xhr;
            post();
        };

        xhr.timeout = htTimeout;

        return xhr;
    }
}