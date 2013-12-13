/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim:set ts=2 sw=2 sts=2 et filetype=javascript
 * ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Jetpack.
 *
 * The Initial Developer of the Original Code is
 * the Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Drew Willcoxon <adw@mozilla.com> (Original Author)
 *   Mike de Boer <mdeboer@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const {Cc, Ci, Cu, Cr} = require("chrome");
const {validateOptions, getHiddenHTMLWindow} = require("api-utils");

Cu.import("resource://gre/modules/Services.jsm");

const validations = {
  "data": {
    "is": ["string", "null", "undefined"]
  },
  "iconURL": {
    "is": ["string", "null", "undefined"]
  },
  "onClick": {
    "is": ["function", "null", "undefined"]
  },
  "text": {
    "is": ["string"]
  },
  "title": {
    "is": ["string"]
  }
};
const kHtmlNs = "http://www.w3.org/1999/xhtml";

var notify;
try {
  let alertServ = Cc["@mozilla.org/alerts-service;1"].
                  getService(Ci.nsIAlertsService);

  // The unit test sets this to a mock notification function.
  notify = alertServ.showAlertNotification.bind(alertServ);
}
catch (err) {
  // An exception will be thrown if the platform doesn't provide an alert
  // service, e.g., if Growl is not installed on OS X.  In that case, use a
  // mock notification function that just logs to the console.
  notify = notifyUsingConsole;
}

function notifyUsingConsole(iconURL, title, text) {
  title = title ? "[" + title + "]" : "";
  text = text || "";
  let str = [title, text].filter(function (s) s).join(" ");
  console.log(str);
}

function getEllipsis() {
  let ellipsis = "[\u2026]";

  try {
    ellipsis = Services.prefs.getComplexValue("intl.ellipsis",
                                              Ci.nsIPrefLocalizedString).data;
  } catch (ex) {}
  return ellipsis;
}

function sanitizeText(message) {
  // Put the message content into a div node of the hidden HTML window.
  let doc = getHiddenHTMLWindow().document;
  let xhtmlElement = doc.createElementNS(kHtmlNs, "div");
  xhtmlElement.innerHTML = message.replace(/<br>/gi, "<br/>");

  // Convert the div node content to plain text.
  let encoder = Cc["@mozilla.org/layout/documentEncoder;1?type=text/plain"]
                  .createInstance(Ci.nsIDocumentEncoder);
  encoder.init(doc, "text/plain", 0);
  encoder.setNode(xhtmlElement);
  let messageText = encoder.encodeToString().replace(/\s+/g, " ");

  // Crop the end of the text if needed.
  if (messageText.length > 50)
    messageText = messageText.substr(0, 50) + getEllipsis();
  return messageText;
}

exports.notify = function notifications_notify(options) {
  let valOpts = validateOptions(options, validations);
  // Sanitize message
  valOpts.text = sanitizeText(valOpts.text);

  let clickObserver = !valOpts.onClick ? null : {
    observe: function notificationClickObserved(subject, topic, data) {
      if (topic === "alertclickcallback")
        valOpts.onClick.call(exports, valOpts.data);
    }
  };

  function notifyWithOpts(notifyFn) {
    notifyFn(valOpts.iconURL, valOpts.title, valOpts.text, !!clickObserver,
             valOpts.data, clickObserver);
  }

  try {
    notifyWithOpts(notify);
  } catch (err if err instanceof Ci.nsIException &&
                  err.result == Cr.NS_ERROR_FILE_NOT_FOUND) {
    console.warn("The notification icon named by " + valOpts.iconURL +
                 " does not exist.  A default icon will be used instead.");
    delete valOpts.iconURL;
    notifyWithOpts(notify);
  } catch (err) {
    notifyWithOpts(notifyUsingConsole);
  }
};
