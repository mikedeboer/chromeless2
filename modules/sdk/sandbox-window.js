/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {Cc, Ci, Cu} = require("chrome");

let gWindows = [];

const ww = Cc["@mozilla.org/embedcomp/window-watcher;1"]
             .getService(Ci.nsIWindowWatcher);
Cu.import("resource://app-bootstrap/console.js");

const Observers = require('sdk/system/events');

const kNsXul = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const kNsXhtml = "http://www.w3.org/1999/xhtml";
const kAppInfo = require("appinfo").contents;

const kMenubar = (typeof kAppInfo.menubar == "undefined" || kAppInfo.menubar) ?
  '<toolbox id="theTopToolbox" style="padding: 0; border: 0; margin: 0;">' +
  '<menubar id="theMenuBar" style="padding: 0; border: 0; margin: 0;">' +
  '</menubar></toolbox>' : "";
const kBlankXul = '<?xml version="1.0"?>' +
                  '<?xml-stylesheet ' + 'href="chrome://global/skin/" type="text/css"?>' +
                  '<?xml-stylesheet ' + 'type="text/css"?>' +
                  '<window xmlns:html="' + kNsXhtml + '"' +
                  '        xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"' +
                  '        xmlns:svg="http://www.w3.org/2000/svg"' +
                  '        xmlns="' + kNsXul + '"' +
                  '        windowtype="navigator:browser"' +
                  '        menu="theMenuBar"' +
                  '        style="padding: 0; border: 0; margin: 0; background-color: white;"' +
                  '        macanimationtype="document"' +
                  '        fullscreenbutton="true"' +
                  '        sizemode="normal"' +
                  '>' +
                    kMenubar +
                  '</window>';

function isTopLevelWindow(w) {
  for (let window of gWindows) {
    if ("_browser" in window)
      return true;
  }
  return false;
}

let checkWindows = function(self, url) {
  let subject = self.subject;
  let window = subject.window;
  if (window.top != window.self) {
    if (isTopLevelWindow(window.parent)) {
      // Top level iframe window
      let ifWin = window.self;
      ifWin.wrappedJSObject.eval("window.top = window.self");
      ifWin.wrappedJSObject.eval("window.parent = window.self");
    } else {
      // This is a frame nested underneath the top level frame
      let ifWin = window.self;
      ifWin.wrappedJSObject.eval("window.top = window.parent.top");
    }
  } else if (isTopLevelWindow(window)) {
    // This is application code! Let's handle injection at this point.
    let wo;
    for (wo of gWindows) {
      if (!wo._browser || wo._browser.contentWindow != window)
        wo = null;
    }
    if (!wo)
      return;

    // "requiring" the prevent navigation module will install a content policy
    // that disallows changing the root HTML page.
    require("prevent-navigation");

    let sandbox = new Cu.Sandbox(
      Cc["@mozilla.org/systemprincipal;1"]
        .createInstance(Ci.nsIPrincipal)
    );
    sandbox.window = subject.wrappedJSObject;

    for (var k in wo.options.injectProps) {
      sandbox[k] = wo.options.injectProps[k];
      Cu.evalInSandbox("window."+k+" = "+k+";", sandbox);
    }
  }
};

Observers.on("content-document-global-created", checkWindows);
Observers.on("chrome-document-global-created", checkWindows);

// Forward in-browser console API calls to ours.
Observers.on("console-api-log-event", function(self) {
  //console.dir(data.wrappedJSObject);
  console.fromEvent(self.data.wrappedJSObject);
});

function Window(options, testCallbacks) {
  let trueIsYes = x => x ? "yes" : "no";

  let features = ["width=" + options.width,
                  "height=" + options.height,
                  "centerscreen=yes"];

  if (options.titleBar == false) features.push("titlebar=no");

  features.push("resizable=" + trueIsYes(options.resizable));
  features.push("menubar=" + trueIsYes(options.menubar));

  // We now pass the options.url, which is the user app directly inserting it in
  // the window, instead using the xul browser element that was here. This
  // helped to make the session history work.
  let url = "data:application/vnd.mozilla.xul+xml," + escape(kBlankXul);
  let window = ww.openWindow(null, url, null, features.join(","), null);

  this._id = gWindows.push(this) - 1;
  this._window = window;
  this._browser = null;
  this._testCallbacks = testCallbacks;
  this.options = options;

  window.addEventListener("close", this, false);
  window.addEventListener("DOMContentLoaded", this, false);
  window.addEventListener("focus", this, false);
}

Window.prototype = {
  handleEvent: function handleEvent(event) {
    switch (event.type) {
      case "close":
        if (event.target == this._window) {
          if (gWindows[this._id])
            delete gWindows[this._id];
          this._window.removeEventListener("close", this, false);
        }
        break;
      case "DOMContentLoaded":
        if (event.target == this._window.document) {
          // update window title
          if (kAppInfo && kAppInfo.title) {
            this._window.document.title = kAppInfo.title;
            console.log(this._window.document.title);
          }

          let browser = this._window.document.createElement("browser");
          browser.setAttribute("id", "main-window");
          browser.setAttribute("disablehistory", "indeed");
          browser.setAttribute("type", "content-primary");
          browser.setAttribute("style", "background:none;background-color:transparent !important");
          browser.setAttribute("flex", "1");
          browser.setAttribute("height", "100%");
          // browser.setAttribute("border", "10px solid green");
          event.target.documentElement.appendChild(browser);

          this._browser = browser;

          browser.focus();

          let parentWindow = this._window;
          browser.addEventListener("DOMTitleChanged", evt => {
            if (evt.target.title.trim().length > 0)
              parentWindow.document.title = evt.target.title;
          }, false);

          // Legacy support for tests.
          if (this._testCallbacks && typeof this._testCallbacks.onload == "function") {
            browser.addEventListener("DOMContentLoaded", () => {
              this._testCallbacks.onload();
            }, false);
          }

          browser.loadURI(this.options.url);
        }
        return false;
      case "focus":
        if (this._browser)
          this.browser.focus();
    }
  },
  close: function() {
    this._window.close();
  }
};

exports.Window = Window;

require("sdk/system/unload").when(function() {
  gWindows.slice().forEach(window => window.close());
});

// an internal export.  what's the proper way to prevent browsercode from
// getting at this?
exports.AllWindows = gWindows;
