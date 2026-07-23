// GENERATED FILE — DO NOT EDIT.
// Source: schemas/install-plan.schema.json

const INSTALL_PLAN_SCHEMA = Object.freeze({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kryonix.org/schemas/install-plan-v2.schema.json",
  "title": "Kryonix Install Plan v2",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "version",
    "isThinkServer",
    "repository",
    "storage",
    "features"
  ],
  "properties": {
    "version": {
      "type": "integer",
      "const": 2
    },
    "isThinkServer": {
      "type": "boolean"
    },
    "repository": {
      "$ref": "#/$defs/repositoryPlan"
    },
    "storage": {
      "$ref": "#/$defs/storagePlan"
    },
    "features": {
      "$ref": "#/$defs/features"
    }
  },
  "$defs": {
    "repositoryPlan": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "coreUrl",
        "upstreamUrl",
        "downstreamUrl",
        "branch"
      ],
      "properties": {
        "coreUrl": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://",
          "minLength": 9
        },
        "upstreamUrl": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://",
          "minLength": 9
        },
        "downstreamUrl": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://",
          "minLength": 9
        },
        "branch": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "mountPlan": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "filesystem",
        "encryption"
      ],
      "properties": {
        "filesystem": {
          "type": "string",
          "enum": [
            "btrfs",
            "zfs",
            "ext4",
            "xfs"
          ]
        },
        "encryption": {
          "type": "string",
          "enum": [
            "none",
            "luks2"
          ]
        }
      }
    },
    "zfsStoragePlan": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "userRefquota"
      ],
      "properties": {
        "userRefquota": {
          "type": "string",
          "pattern": "^[1-9][0-9]*(K|M|G|T|P)(i?B)?$",
          "examples": [
            "100G"
          ]
        }
      }
    },
    "btrfsStoragePlan": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "userQgroupLimit"
      ],
      "properties": {
        "userQgroupLimit": {
          "type": "string",
          "pattern": "^[1-9][0-9]*(K|M|G|T|P)(i?B)?$",
          "examples": [
            "100G"
          ]
        }
      }
    },
    "storagePlan": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "topology",
        "systemDisks",
        "dataDisks",
        "manualPartitions"
      ],
      "properties": {
        "topology": {
          "type": "string",
          "enum": [
            "single",
            "split",
            "raid",
            "manual"
          ]
        },
        "systemDisks": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^/dev/.+"
          },
          "uniqueItems": true
        },
        "dataDisks": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^/dev/.+"
          },
          "uniqueItems": true
        },
        "root": {
          "oneOf": [
            {
              "$ref": "#/$defs/mountPlan"
            },
            {
              "type": "null"
            }
          ]
        },
        "data": {
          "oneOf": [
            {
              "$ref": "#/$defs/mountPlan"
            },
            {
              "type": "null"
            }
          ]
        },
        "raidLevel": {
          "type": [
            "string",
            "null"
          ]
        },
        "manualPartitions": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "uniqueItems": true
        },
        "zfs": {
          "oneOf": [
            {
              "$ref": "#/$defs/zfsStoragePlan"
            },
            {
              "type": "null"
            }
          ]
        },
        "btrfs": {
          "oneOf": [
            {
              "$ref": "#/$defs/btrfsStoragePlan"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "allOf": [
        {
          "if": {
            "anyOf": [
              {
                "required": [
                  "root"
                ],
                "properties": {
                  "root": {
                    "type": "object",
                    "required": [
                      "filesystem"
                    ],
                    "properties": {
                      "filesystem": {
                        "const": "zfs"
                      }
                    }
                  }
                }
              },
              {
                "required": [
                  "data"
                ],
                "properties": {
                  "data": {
                    "type": "object",
                    "required": [
                      "filesystem"
                    ],
                    "properties": {
                      "filesystem": {
                        "const": "zfs"
                      }
                    }
                  }
                }
              }
            ]
          },
          "then": {
            "required": [
              "zfs"
            ],
            "properties": {
              "zfs": {
                "$ref": "#/$defs/zfsStoragePlan"
              }
            }
          }
        },
        {
          "if": {
            "required": [
              "data"
            ],
            "properties": {
              "data": {
                "type": "object",
                "required": [
                  "filesystem"
                ],
                "properties": {
                  "filesystem": {
                    "const": "btrfs"
                  }
                }
              }
            }
          },
          "then": {
            "required": [
              "btrfs"
            ],
            "properties": {
              "btrfs": {
                "$ref": "#/$defs/btrfsStoragePlan"
              }
            }
          }
        }
      ]
    },
    "featureSelection": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^[A-Za-z0-9][A-Za-z0-9_-]*$": {
          "type": "boolean"
        }
      }
    },
    "features": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^[A-Za-z0-9][A-Za-z0-9_-]*$": {
          "$ref": "#/$defs/featureSelection"
        }
      }
    }
  }
});

export { INSTALL_PLAN_SCHEMA };
export default INSTALL_PLAN_SCHEMA;
