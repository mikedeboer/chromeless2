/* ***** BEGIN LICENSE BLOCK *****
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
 *   Lloyd Hilaiel <lloyd@hilaiel.com>
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

const {Cc, Ci, Cr, Cu} = require("chrome");
const Events = require("sdk/event/core");

/**
 * @class ProgressMonitor
 * An object that allows you to attach to iframes containing web content
 * to subscribe to events which provide information about the progress
 * of loading web resources.
 *
 * Example Usage:
 *
 *     let pm = require("web-content").ProgressMonitor();
 *     pm.attach(document.getElementById("someIFrame"));
 *     pm.on("title-change", function(title) {
 *       console.log("Title of loaded content changed: " + title);
 *     };
 */
function ProgressMonitor(iframe) {
  if (!(this instanceof ProgressMonitor))
    return new ProgressMonitor();

  // EventEmitter interface:
  this.on = Events.on.bind(this, this);
  this.once = Events.once.bind(this, this);
  this.off = this.removeListener = Events.off.bind(this, this);
  this.emit = Events.emit.bind(this, this);

  this.attach(iframe);
}

ProgressMonitor.prototype = {
  _iframe: null,
  _browserStatusHandler: null,

  attach: function(iframe) {
    this.detach();

    // verify that the argument is acutally an iframe element!
    if (typeof iframe !== "object" || iframe.contentWindow === undefined) {
      throw "ProgressMonitor.attach() requires an iframe dom node as an argument";
    }
    this._iframe = iframe;

    // http://forums.mozillazine.org/viewtopic.php?f=19&t=1084155
    let frameShell = iframe.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                         .getInterface(Ci.nsIWebNavigation)
                                         .QueryInterface(Ci.nsIDocShell);

    // chrome://global/content/bindings/browser.xml#browser
    let webProgress = frameShell.QueryInterface(Ci.nsIInterfaceRequestor)
                                .getInterface(Ci.nsIWebProgress);

    this._browserStatusHandler = new nsBrowserStatusHandler(this);
    this._browserStatusHandler.init(eventEmitter, iframe);
    let filter = Cc["@mozilla.org/appshell/component/browser-status-filter;1"]
                   .createInstance(Ci.nsIWebProgress);
    webProgress.addProgressListener(filter, Ci.nsIWebProgress.NOTIFY_ALL);
    filter.addProgressListener(this._browserStatusHandler, Ci.nsIWebProgress.NOTIFY_ALL);

    // (lth) Reference the filter from the dom element that uses it. This ensures
    // there's a proper reference count on the progress listeners.
    iframe.progressListenerFilter = filter;

    /* We need to hook up a service to bind security awareness here, 
     * I am not totally sure about this, but searching in browser
     * implementation was able to find some security UI doc 
     * http://mxr.mozilla.org/mozilla-central/source/toolkit/content/widgets/browser.xml#544
     */
    if (!frameShell.securityUI) { 
      let securityUI = Cc["@mozilla.org/secure_browser_ui;1"]
                         .createInstance(Ci.nsISecureBrowserUI);
      securityUI.init(iframe.contentWindow);
    };
  },

  detach: function() {
    if (this._iframe && this._iframe.progressListenerFilter)
      delete this._iframe.progressListenerFilter;
    this._iframe = this._browserStatusHandler = null;
  }
};

exports.ProgressMonitor = ProgressMonitor;

function nsBrowserStatusHandler(parent) {
  if (!(this instanceof nsBrowserStatusHandler))
    return new nsBrowserStatusHandler(parent);
  this._parent = this;
}

nsBrowserStatusHandler.prototype = {
  _parent: null,
  lastKnownTitle: null,
  eventEmitter: null,
  lastProgressSent: null,

  QueryInterface : function(aIID) {
    if (aIID.equals(Ci.nsIWebProgressListener) ||
        aIID.equals(Ci.nsIXULBrowserWindow) ||
        aIID.equals(Ci.nsISupportsWeakReference) ||
        aIID.equals(Ci.nsISupports)) {
      return this;
    }
    throw Cr.NS_NOINTERFACE;
  },

  onStateChange : function(aWebProgress, aRequest, aStateFlags, aStatus) {
    const wpl = Ci.nsIWebProgressListener;

    // START and WINDOW are the earliest hooks we'll get at the time a request
    // starts
    if (aStateFlags & wpl.STATE_IS_WINDOW) {
      if (aStateFlags & wpl.STATE_START)
        this.startDocumentLoad(aRequest);
      else if (aStateFlags & wpl.STATE_STOP)
        this.endDocumentLoad(aRequest, aStatus);
    }

    return;
  },

  onProgressChange : function(aWebProgress, aRequest, aCurSelf, aMaxSelf, aCurTotal, aMaxTotal) {
    this.checkTitle();
    let curProgress = 100.0 * (aCurTotal / aMaxTotal);
    if (curProgress > this.lastProgressSent) {
      /**
       * @event progress
       * Allows the listener to understand approximately how much of the
       * page has loaded.
       * @payload {number} The percentage (0..100) of page load that is complete
       */
      this._parent.emit("progress", curProgress);
      this.lastProgressSent = curProgress;
    }
  },

  onLocationChange : function(aWebProgress, aRequest, aLocation) {},

  onStatusChange : function(aWebProgress, aRequest, aStatus, aMessage) {
    /**
     * @event status-changed
     * Provides human readable textual strings which contain load status
     * @payload {string} A description of status of the page load.
     */
    this._parent.emit("status-changed", aMessage);
  },

  onSecurityChange : function(aWebProgress, aRequest, aState) {
    let detail = {};

    [
      [Ci.nsIWebProgressListener.STATE_IS_INSECURE, "insecure"],
      [Ci.nsIWebProgressListener.STATE_IS_BROKEN, "broken"],
      [Ci.nsIWebProgressListener.STATE_IS_SECURE, "secure"]
    ].forEach(function(x) {
      if (aState & x[0])
        detail.state = x[1];
    });

    [
      [Ci.nsIWebProgressListener.STATE_SECURE_HIGH, "high"],
      [Ci.nsIWebProgressListener.STATE_SECURE_MED, "med"],
      [Ci.nsIWebProgressListener.STATE_SECURE_LOW, "low"]
    ].forEach(function(x) {
      if (aState & x[0])
        detail.strength = x[1];
    });
    /**
     * @event security-change
     * An event raised during load which emits a JavaScript object
     * containing the "security state" of the page: `.state` is one of
     * *`insecure`*, *`broken`*, or *`secure`* (get [more
     * info](https://developer.mozilla.org/en/nsIWebProgressListener#State_Security_Flags)
     * on states), while `.strength` is *`.low`*, *`.medium`*, or
     * *`high`* ( [read
     * more](https://developer.mozilla.org/en/nsIWebProgressListener#Security_Strength_Flags)
     * about *strengths*).
     * @payload {object}
     */
    this._parent.emit("security-change", detail);
  },

  startDocumentLoad : function(aRequest) {
    this.checkTitle();
    /**
     * @event load-start
     * Dispatched when navigation starts.  This event is delivered before any
     * network interaction takes place.
     * @payload {string} The url of web content to be loaded.
     */
    this._parent.emit("load-start", aRequest.name);
    this._parent.emit("progress", 0.0);
    this.lastProgressSent = 0;
  },

  endDocumentLoad : function(aRequest, aStatus) {
    this.checkTitle();
    if (this.lastProgressSent != 100) {
      this.lastProgressSent = 100;
      // documented above
      this._parent.emit("progress", 100.0);
    }
    /**
     * @event load-stop
     * An event raised upon completion of a top level document
     * load.  Fired after all resources have been loaded, or if the load has been
     * programmatically stopped.
     */
    this._parent.emit("load-stop");
  },

  checkTitle: function() {
    let title = this._parent._iframe.contentDocument.title;
    if (typeof title === "string" && title !== this.lastKnownTitle) {
      this.lastKnownTitle = title;
      /**
       * @event title-changed
       * Dispatched when the title of web content changes during load.
       * @payload {string} The new title of the web content.
       */
      this._parent.emit("title-change", title);
    }
  },

  setJSStatus : function(status) {},
  setJSDefaultStatus : function(status) {},
  setDefaultStatus : function(status) {},
  setOverLink : function(link, b) {}
}
/** @endclass */

/**
 * stop the loading of content within an iframe 
 * @params {IFrameNode} frame An iframe dom node.
 */
exports.stopload = function(frame) { 
  let webNav = frame.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                  .getInterface(Ci.nsIWebNavigation);
  webNav.stop(webNav.STOP_ALL);
};

/**
 * Access the title of an iframe.
 * @params {IFrameNode} frame An iframe dom node.
 * @returns {string} The current title of the content in the iframe.
 */
exports.title = function(frame) {
  return frame.contentDocument.title;
};

/**
 * Programmatically zoom content inside an iframe
 * @params {IFrameNode} frame An iframe dom node.
 * @params {zoomRatio} zoom value, from 0 to 1 
 */
exports.zoom = function (frame, ratio) { 
   let frameShell = frame.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                       .getInterface(Ci.nsIWebNavigation)
                                       .QueryInterface(Ci.nsIDocShell);
   let contViewer = frameShell.contentViewer;
   let docViewer = contViewer.QueryInterface(Ci.nsIMarkupDocumentViewer);
   docViewer.fullZoom = ratio;
};

/**
 * Emit events inside iframes hosting untrusted web content.
 * This function gives you a way to synthesize and dispatch a
 * [MessageEvent](https://developer.mozilla.org/en/DOM/window.postMessage#The_dispatched_event)
 * into an iframe.  The web content should deal with the event
 * as they would deal with a MessageEvent resulting from
 * [window.postMessage](https://developer.mozilla.org/en/DOM/window.postMessage),
 * that is specifically `ev.origin` will be set to 'chrome' and
 * `ev.data` will be a JSON string representation of the `data`
 * parameter passed to emit().
 *
 * Sample application code to emit an event is thus:
 *
 *     let iframe = document.getElementsByTagName("iframe")[0];
 *     require("web-content").emit(iframe, "myevent", {foo:"bar"});
 *
 * From web content, the event can be caught like this:
 *
 *     window.addEventListener("event1", function(ev) {
 *         alert(JSON.parse(ev.data));
 *     }, false);
 *
 * @param {IFrameNode} frame Where to emit the event.
 * @param {string} name The name of the event
 * @param {object|string} data Data to be emitted in the event
 */
exports.emit = function(frame, name, data) {
    if (typeof name != "string")
      throw "Emit requires a string argument for event name";
    let ev = frame.contentWindow.document.createEvent("MessageEvent");
    // doesn't bubble, may be canceled
    ev.initMessageEvent(name, false, true, JSON.stringify(data), "chrome", "0", frame.contentWindow);
    frame.contentWindow.dispatchEvent(ev);
};

/**
 * Access the scrollTop an iframe.
 * @params {IFrameNode} frame An iframe dom node.
 * @returns {number} The current offset in pixels of the scrolling in the iframe.
 */
exports.scrollTop = function(frame) {
  return frame.contentWindow.scrollY;
};

/**
 * Inject a function or property into a web content window.
 * @params {IFrameNode} frame An iframe dom node.
 * @params {string} attachPoint the property of `window.` to which this function
 *                              shall be attached. This string *may* include dots
 *                              '.', in which case it will be interpreted as a
 *                              nested property
 * @params {object} obj A property to attach to the specified attach point, a
 *                      function or object
 * may be used.
 */
exports.inject = function(frame, attach, func) {
    let w = frame.contentWindow.wrappedJSObject;
    let ar = attach.split(".");
    while (ar.length) {
      let x = ar.shift();
      if (ar.length) {
        if (!(w.hasOwnProperty(x))) w[x] = {};
        w = w[x];
      } else {
        w[x] = func;
      }
    }
    w[attach] = func;
};

/**
 * given a string (typically the result of human input), attempt to guess the well
 * formed URL intended.  For instanced, this function will turn `mozilla.com`
 * into `http://mozilla.com`.
 * @param {string} fragment A url fragment
 * @returns {string} A guess at a well formed url.
 */
exports.guessUrl = function(fragment) {
  try {
    let fixupSvc = Cc["@mozilla.org/docshell/urifixup;1"].getService(Ci.nsIURIFixup);
    return fixupSvc.createFixupURI(fragment,0).spec;;
  } catch(e) {}
  // if we can't fix it up, just return it.
  return fragment;
};
