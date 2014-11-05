/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function ContentPermissionPrompt() {}

ContentPermissionPrompt.prototype = {
  classID: Components.ID("{b6f6d8cf-ef2b-448b-a886-f3c991f8080a}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPermissionPrompt]),

  prompt: function(request) {
    // For chromeless, we auto-allow all geolocation, desktop-
    // notification and pointerLock requests.
    request.allow();
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([ContentPermissionPrompt]);
