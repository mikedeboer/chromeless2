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
 * The Original Code is the manifest parser from mozilla's openwebapps project.
 *
 * Contributor(s):
 *   Michael Hanson <mhanson@mozilla.com>
 *   Lloyd Hilaiel <lloyd@mozilla.com>
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

"use strict";

const AppPaths = require("app-paths");
const {Iterator} = require("api-utils");
const Fs = require("fs");
const Path = require("path");

const errorThrow = function(msg, path) {
  if (path && !Array.isArray(path))
    path = [path];
  throw {
    msg: msg,
    path: (path ? path : []),
    toString: function () {
      var pfx = "[appinfo] ";
      if (this.path && this.path.length)
        return pfx + this.msg + " (" + Path.join.apply(Path, this.path) + ")";
      return pfx + this.msg;
    }
  };
};

// Commonly used check functions
const isInteger = function(x) {
  return (typeof x == "number" && Math.ceil(x) == Math.floor(x));
};

const nonEmptyStringCheck = function(x) {
  if (typeof x != "string" || x.length === 0)
    errorThrow();
};

const stringCheck = function(x) {
  if (typeof x != "string")
    errorThrow();
};

const booleanCheck = function(x) {
  if (typeof x != "boolean")
    errorThrow();
};

// a table that specifies manfiest properties, and validation functions
// each key is the name of a valid top level property.
// each value is an object with four optional properties:
//  required: if present and has a truey value, then the prop is required
//  check: if present and a function for a value, then is passed a value present in appinfo for validation
//  normalize: if present and has a function for a value, then accepts current value
//             in appinfo as argument, and outputs a value to replace it.
//
// returning errors:
//   validation functions throw objects with two fields:
//     msg: an english, developer readable error message
//     path: an array of properties that describes which field has the error
//
const manfProps = {
  build_id: {
    required: true,
    // Allow build_id to be an integer or a string of all digits
    check: function(x) {
      if (isInteger(x) || (typeof x === "string" && /^[1-9][0-9]*$/.test(x)))
        return;
      errorThrow();
    },
    // Normalize build_id to an integer 
    normalize: function(x) {
      return (typeof x === "string") ? parseInt(x) : x;
    }
  },
  developer_email: {
    required: true,
    check: nonEmptyStringCheck
  },
  menubar: {
    required: false,
    check: booleanCheck
  },
  dependencies: {
    required: false,
    check: function(x) {
      if (!Array.isArray(x))
        errorThrow();
      x.forEach(y => stringCheck(y));
    }
  },
  name: {
    required: true,
    check: nonEmptyStringCheck
  },
  title: {
    required: false
  },
  appicon: {
    required: false
  },
  resizable: {
    required: false,
    check: booleanCheck
  },
  width: {
    required: false,
    check: isInteger
  },
  height: {
    required: false,
    check: isInteger
  },
  vendor: {
    required: true,
    check: nonEmptyStringCheck
  },
  enableSystemPrivileges: {
    required: false,
    check: booleanCheck
  },
  version: {
    required: true,
    check: function(x) {
      if (typeof x != "string" || !/^[0-9]+\.[0-9]+$/.test(x))
        errorThrow();
    }
  }
};

const manfAliases = {
  menubars: "menubar"
};


// A function to extract nested values given an object and array of property names
function extractValue(obj, props) {
  return ((props.length === 0) ? obj : extractValue(obj[props[0]], props.slice(1)));
}

// A function that will validate properties of a manfiest using the manfProps
// data structure above. Returns a normalized version of the appinfo, throws upon
// detection of invalid properties.
function validateAppinfoProperties(manf) {
  let normalizedManf = {};
  for (let [prop, pSpec] of Iterator(manf)) {
    if (!(prop in manfProps))
      errorThrow("unsupported property", prop);
    if (typeof pSpec.check == "function") {
      try {
        pSpec.check(manf[prop]);
      } catch (e) {
        e.path.unshift(prop);
        if (!e.msg)
          e.msg = "invalid value: " + extractValue(manf, e.path);
        throw e;
      }
    }
    normalizedManf[prop] = manf[prop];
    if (normalizedManf[prop] === undefined)
      delete normalizedManf[prop];
    // Special case. A normalization function can remove properties by
    // returning undefined.
  }
  return normalizedManf;
}

// validate a javascript representation of an package.json, throw nice error objects
// if something ain't right
function validate(manf) {
  // Validate and clean the request
  if (!manf)
    errorThrow("null");

  // handle aliases
  for (let alias of Iterator(manfAliases)) {
    if (!manf[alias])
      continue;
    manf[manfAliases[alias]] = manf[alias];
    delete manf[alias];
  }

  // iterate through required properties, and verify they're present
  for (let [prop, desc] of Iterator(manfProps)) {
    if (!desc.required)
      continue;
    if (!(prop in manf))
      errorThrow("missing '" + prop + "' property");
  }

  return validateAppinfoProperties(manf, false);
};

/**
 * [`package.json`](#guide/startup-parameters) is a small file that contains
 * various application parameters used in startup and packaging.
 *
 * This module give you conveinent read access to this file
 */
let appInfoContents = null;

/**
 * @prop contents
 * (read-only) The contents of the `package.json` file as a javascript object
 * @throws upon access if the package.json file is malformed (this should happen
 * at application startup, and never during runtime.  In application code this
 * exception can be safely ignored).
 */
module.exports = {
  get contents() {
    if (!appInfoContents) {
      let contents = Fs.readFileSync(Path.join(AppPaths.appCodeDir, "package.json"), "utf8");
      try {
        appInfoContents = JSON.parse(contents);
      } catch(e) {
        throw new Error("syntax error in JSON: " + e.toString());
      }
      appInfoContents = validate(appInfoContents);
    }
    return appInfoContents;
  }
};
