/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

this.AppStartup = function AppStartup() {
  this.wrappedJSObject = this;
};

this.AppStartup.prototype = {
  classID: Components.ID("{6724fc1b-3ec4-40e2-8583-8061088b3185}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  _harness: null,

  observe: function(subject, topic, data) {
    switch (topic) {
      case "app-startup":
        Services.obs.addObserver(this, "final-ui-startup", true);
        break;
      case "final-ui-startup":
        Services.obs.removeObserver(this, topic);
        //dump("final-ui-startup:: \n");
        break;
    }
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([AppStartup]);
