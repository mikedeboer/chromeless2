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

(function(global) {

"use strict";

const {classes: Cc, Constructor: CC, interfaces: Ci, utils: Cu, results: Cr,
       manager: Cm} = Components;
const {notifyObservers} = Cc["@mozilla.org/observer-service;1"]
                            .getService(Ci.nsIObserverService);

let exports = {};

// Load the SecurableModule prerequisite.
let securableModule;
let myURI = Components.stack.filename.split(" -> ").slice(-1)[0];

if (global.require) {
  // We're being loaded in a SecurableModule.
  securableModule = require("sdk/securable-module");
} else {
  let ios = Cc["@mozilla.org/network/io-service;1"]
              .getService(Ci.nsIIOService);
  let securableModuleURI = ios.newURI("securable-module.js", null,
                                      ios.newURI(myURI, null, null));
  if (securableModuleURI.scheme == "chrome") {
    // The securable-module module is at a chrome URI, so we can't
    // simply load it via Cu.import(). Let's assume we're in a
    // chrome-privileged document and use mozIJSSubScriptLoader.
    let loader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
                   .getService(Ci.mozIJSSubScriptLoader);

    // Import the script, don't pollute the global scope.
    securableModule = {__proto__: global};
    loader.loadSubScript(securableModuleURI.spec, securableModule);
    securableModule = securableModule.SecurableModule;
  } else {
    securableModule = {};
    try {
      Cu.import(securableModuleURI.spec, securableModule);
    } catch (e if e.result == Cr.NS_ERROR_ILLEGAL_VALUE) {
      Cu.reportError("Failed to load " + securableModuleURI.spec);
    }
  }
}

const bind = Function.call.bind(Function.bind);
// Export some useful utilities from SecurableModule.
const override = exports.override = securableModule.override;
const freeze = exports.freeze = securableModule.freeze;
const iced = exports.iced = securableModule.iced;

// Takes `loader`, and unload `reason` string and notifies all observers that
// they should cleanup after them-self.
function unloadLoader(loader, reason) {
  // subject is a unique object created per loader instance.
  // This allows any code to cleanup on loader unload regardless of how
  // it was loaded. To handle unload for specific loader subject may be
  // asserted against loader.destructor or require('@loader/unload')
  // Note: We don not destroy loader's module cache or sandboxes map as
  // some modules may do cleanup in subsequent turns of event loop. Destroying
  // cache may cause module identity problems in such cases.
  let subject = {wrappedJSObject: loader.destructor};
  notifyObservers(subject, "sdk:loader:destroy", reason);
}

function modifyModuleSandbox(sandbox, options) {
  let filename = options.filename ? options.filename : null;
  sandbox.defineProperty("__url__", filename);
}

function makeManifestChecker(packaging) {
  return {
    _allow: function _allow(loader, basePath, module, module_info) {
        return true;
    },
    allowEval: function allowEval(loader, basePath, module, module_info) {
      return this._allow(loader, basePath, module, module_info);
    },

    allowImport: function allowImport(loader, basePath, module, module_info,
                                      exports) {
      return this._allow(loader, basePath, module, module_info);
    }
  };
}

const main = iced(function main(loader, id) {
  return loader.require(id);
});
exports.main = main;


const resolve = iced(function resolve(id) {
  return id;
});
exports.resolve = resolve;

const Loader = iced(function Loader(options) {
  let globals = {};

  if (options.globals) {
    for (let name in options.globals)
      globals[name] = options.globals[name];
  }

  if (options.console)
    globals.console = options.console;

  if ("modules" in options)
    throw new Error("options.modules is no longer supported");

  // We create an identity object that will be dispatched on an unload
  // event as subject. This way unload listeners will be able to assert
  // which loader is unloaded. Please note that we intentionally don't
  // use `loader` as subject to prevent a loader access leakage through
  // observer notifications.
  let destructor = freeze(Object.create(null));

  function makeGetModuleExports(delegate, options) {
    return function getModuleExports(basePath, module) {
      switch (module) {
        case "chrome":
          return {Cc: Cc, Ci: Ci, Cu: Cu, Cr: Cr, Cm: Cm,
                  CC: bind(CC, Components), components: Components,
                  // `ChromeWorker` has to be inject in loader global scope.
                  // It is done by bootstrap.js:loadSandbox for the SDK.
                  ChromeWorker: ChromeWorker};
        case "parent-loader":
          return this;
        case "@loader/options":
          return options;
        case "@loader/unload":
          return destructor;
        default:
          return (delegate ? delegate.call(this, basePath, module) : null);
      }
    };
  }

  let getModuleExports = makeGetModuleExports(options.getModuleExports, options);

  let manifestChecker = undefined;
  let packaging = options.packaging || globals.packaging;
  if (packaging)
    manifestChecker = makeManifestChecker(packaging);

  let loaderOptions = override({
    defaultPrincipal: "system",
    globals: globals,
    resolve: exports.resolve,
    modifyModuleSandbox: modifyModuleSandbox,
    securityPolicy: manifestChecker,
    getModuleExports: getModuleExports
  }, options);

  let loader = new securableModule.Loader(loaderOptions);

  loader.console = globals.console;
  loader.destructor = destructor;
  loader.unload = unloadLoader.bind(null, loader);

  return loader;
});
exports.Loader = Loader;

if (global.window) {
  // We're being loaded in a chrome window, or a web page with UniversalXPConnect
  // privileges.
  global.Cuddlefish = exports;
} else if (global.exports) {
  // We're being loaded in a SecurableModule.
  for (name in exports)
    global.exports[name] = exports[name];
} else {
  // We're being loaded in a JS module.
  global.EXPORTED_SYMBOLS = [];
  for (let name in exports) {
    global.EXPORTED_SYMBOLS.push(name);
    global[name] = exports[name];
  }
}

})(this);
