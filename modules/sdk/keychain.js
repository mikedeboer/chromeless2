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
 * The Original Code is Chromeless.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Mike de Boer <mdeboer@mozilla.com> (Original Author)
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

const Process = require("process");
const {validateOptions, override} = require("api-utils");
const {KeychainServices} = require("platform/osx/KeychainServices");

const validations = {
  "setCredentials": {
    "common": {
      "accountName": {
        "is": ["string"]
      },
      "password": {
        "is": ["string"]
      },
      "comment": {
        "is": ["string", "null", "undefined"]
      },
      "label": {
        "is": ["string", "null", "undefined"]
      }
    },
    "generic": {
      "serviceName": {
        "is": ["string"]
      }
    },
    "internet": {
      "protocolType": {
        "is": ["string", "null", "undefined"]
      },
      "serverName": {
        "is": ["string"]
      },
      "port": {
        "is": ["string", "number"]
      },
      "path": {
        "is": ["string"]
      },
      "authenticationType": {
        "is": ["string", "null", "undefined"]
      },
      "securityDomain": {
        "is": ["string"]
      }
    }
  },
  "getCredentials": {
    "common": {
      "accountName": {
        "is": ["string"]
      }
    },
    "generic": {
      "serviceName": {
        "is": ["string"]
      }
    },
    "internet": {
      "protocolType": {
        "is": ["string", "null", "undefined"]
      },
      "serverName": {
        "is": ["string", "null", "undefined"]
      },
      "port": {
        "is": ["string", "number", "null", "undefined"]
      },
      "path": {
        "is": ["string", "null", "undefined"]
      },
      "authenticationType": {
        "is": ["string", "null", "undefined"]
      },
      "securityDomain": {
        "is": ["string", "null", "undefined"]
      }
    }
  }
};

/**
 * Add a password to the system's keychain.
 *
 * @param {Object} options
 */
exports.setCredentials = function(options) {
  let common = validations.setCredentials.common;
  if ("serviceName" in options) {
    // Credentials of type 'Generic'
    options = override(validateOptions(options, common),
                       validateOptions(options, validations.setCredentials.generic));
    if (Process.platform == "darwin") {
      return KeychainServices.addGenericPassword(
        options.accountName, options.password, options.serviceName,
        options.comment, options.label
      );
    }
  } else {
    // Credentials of type 'Internet'
    options = override(validateOptions(options, common),
                       validateOptions(options, validations.setCredentials.internet));
    if (Process.platform == "darwin") {
      return KeychainServices.addInternetPassword(
        options.accountName, options.password, options.protocolType,
        options.serverName, options.port, options.path, options.authenticationType,
        options.securityDomain, options.comment, options.label
      );
    }
  }
};

/**
 * Search for a password in the system's keychain.
 *
 * @param {Object} options
 */
exports.getCredentials = function(options) {
  let common = validations.getCredentials.common;
  if ("serviceName" in options) {
    // Credentials of type 'Generic'
    options = override(validateOptions(options, common),
                       validateOptions(options, validations.getCredentials.generic));
    if (Process.platform == "darwin") {
      return KeychainServices.findGenericPasswords(
        options.accountName, options.serviceName
      );
    }
  } else {
    // Credentials of type 'Internet'
    options = override(validateOptions(options, common),
                       validateOptions(options, validations.getCredentials.internet));
    if (Process.platform == "darwin") {
      return KeychainServices.findInternetPasswords(
        options.accountName, options.protocolType, options.serverName,
        options.port, options.authenticationType, options.securityDomain
      );
    }
  }
  return [];
};
