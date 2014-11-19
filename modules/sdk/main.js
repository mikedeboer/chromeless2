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
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Atul Varma <atul@mozilla.com>
 *   Marcio Galli <mgalli@mgalli.com>
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

// This is temporary, we are temporaily exposing this to the HTML
// developer browser, so we can continue to test the tabbrowser
// element and session store til we figure out and keep things things
// here in this main app context. Search for Ci, we current expose Ci
// to the developers HTML browser.

const {Ci, Cc, Cr, Cu} = require("chrome");
const path = require("path");
const appinfo = require("appinfo");
const AppPaths = require("app-paths");
const process = require("process");
const {Buffer} = require("sdk/io/buffer");
const {override} = require("api-utils");
const {setTimeout, clearTimeout, setInterval, clearInterval} = require("sdk/timers");

let appWindow = null;

const kDefaultWindowWidth = 800;
const kDefaultWindowHeight = 600;

// These functions are used from the test application.
module.exports = exports = {
  get AppWindow() {
    return appWindow;
  },
  get AppBrowser() {
    return appWindow._browser;
  },
  StartTime: Date.now()
};

function enableDebuggingOutputToConsole() {
  return;
  let jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"]
              .getService(Ci.jsdIDebuggerService);

  jsd.errorHook = {
    onError: function(message, fileName, lineNo, colNo, flags, errnum, exc) {
      // check message type
      let jsdIErrorHook = Ci.jsdIErrorHook;
      let messageType;
      if (flags & jsdIErrorHook.REPORT_ERROR)
        messageType = "Error";
      if (flags & jsdIErrorHook.REPORT_WARNING)
        messageType = "Warning";
      if (flags & jsdIErrorHook.REPORT_EXCEPTION)
        messageType = "Uncaught-Exception";
      if (flags & jsdIErrorHook.REPORT_STRICT)
        messageType += "-Strict";

      // for now we decide NOT to show any other message than Error or Exception:
      if (flags & jsdIErrorHook.REPORT_ERROR || flags & jsdIErrorHook.REPORT_EXCEPTION) {
        console.log(messageType + ": '" + message + "' in file '" + fileName +
                    "' at line " + lineNo + ", col " + colNo + " (" + errnum +
                    ")\n");
      }

      // return false; // trigger debugHook
      return true; // if you do not wish to trigger debugHook
    }
  };

  // note that debugHook does not _always_ trigger when jsd.errorHook[onError] returns false 
  // it is not well-known why debugHook sometimes fails to trigger 
  jsd.debugHook = {
    onExecute: function(frame, type, rv) {
      let stackTrace = "";
      for (let f = frame; f; f = f.callingFrame) {
        stackTrace += "@ " + f.script.fileName + " at line " + f.line +
                      " function " + f.functionName + "\n";
      }
      console.log(stackTrace);

      return Ci.jsdIExecutionHook.RETURN_CONTINUE;
    }
  };

  jsd.asyncOn(function() {
    console.log("debugger enabled");
  });
}

function requireForBrowser(moduleName, context = this) {
  console.log("browser HTML requires: " + moduleName);
  try {
    return require(moduleName);
  } catch(ex) {
    console.log("require of '" + moduleName + "' failed: " + ex.message);
    console.log(ex.stack);
    // re-throw to the developer to give them an opportunity to handle the error
    throw ex;
  }
}

exports.main = function main(options, testCallbacks) {
  // Access package.json contents for startup parameters
  const ai = appinfo.contents;

  let call = options.staticArgs;
  const {Window} = require("sandbox-window");

  let file = path.basename(call.app);

  let systemMode = appinfo.contents.enableSystemPrivileges ? true : false;

  let rootPath, startPage;
  if (systemMode) {
    rootPath = path.join(call.appBasePath, path.dirname(call.app));
    startPage = require("sdk/url").fromFilename(call.appBasePath);
    let protocol = require("custom-protocol").register("chromeless");
    protocol.setHost("main", startPage , "system");
    startPage = "chromeless://main/" + call.app;
  } else {
    // convert app url into a resource:// url
    // i.e. 'app_code/index.html' is mapped to 'resource://app/index.html'
    let file = path.basename(call.app);
    rootPath = path.join(call.appBasePath, path.dirname(call.app));
    startPage = "resource://app/" + file;

    ios = Cc["@mozilla.org/network/io-service;1"]
            .getService(Ci.nsIIOService),
    resProtocol = ios.getProtocolHandler("resource")
                     .QueryInterface(Ci.nsIResProtocolHandler),

    environment = Cc["@mozilla.org/process/environment;1"]
                    .getService(Ci.nsIEnvironment),
    resRoot = Cc["@mozilla.org/file/local;1"]
                .createInstance(Ci.nsILocalFile),

    resRoot.initWithPath(rootPath);

    resProtocol.setSubstitution("app", ios.newFileURI(resRoot));

    // register chrome://* URIs
    let cr = Cc["@mozilla.org/chrome/chrome-registry;1"]
               .getService(Ci.nsIChromeRegistry);
    cr.checkForNewChrome();
  }

  AppPaths.setResourcePaths(Object.keys(options.resources));

  console.log("Loading app using: " + startPage);

  // enable debugging by default
  enableDebuggingOutputToConsole();

  // Page window height and width is fixed, it won't be and it also should be
  // smart, so HTML browser developer can change it when they set inner document
  // width and height.
  appWindow = new Window({
    url: startPage,
    width: ai.width || kDefaultWindowWidth,
    height: ai.height || kDefaultWindowHeight,
    resizable: ai.resizable ? true : false,
    menubar: ai.menubar ? true : false,
    injectProps : override({
      require: requireForBrowser,
      exit: function() {
        console.log("window.exit() called...");
        appWindow.close();
        // This is for tests framework to test the window exists or not:
        appWindow = null;
      }
    }, this)
  }, testCallbacks);
};

exports.onUnload = function (reason) {
  console.log("shutting down.");
  if (appWindow)
    appWindow.close();
};
