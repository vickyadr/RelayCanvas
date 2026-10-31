// Built-in example loaded from user sketch.
export function demoDoc() {
  return {
  "version": 1,
  "dt": 1,
  "parts": [
    {
      "id": "R1",
      "kind": "rail",
      "x": 1280,
      "y": 200,
      "rot": 0,
      "props": {
        "v": 24,
        "ac": false,
        "f": 50,
        "n": false,
        "owner": "",
        "rsrc": 0.1,
        "len": 1000,
        "rating": 0,
        "label": ""
      }
    },
    {
      "id": "R2",
      "kind": "rail",
      "x": 1280,
      "y": 320,
      "rot": 0,
      "props": {
        "v": 220,
        "ac": true,
        "f": 50,
        "n": false,
        "owner": "",
        "rsrc": 0.1,
        "len": 1000,
        "rating": 0,
        "label": ""
      }
    },
    {
      "id": "R3",
      "kind": "rail",
      "x": 1280,
      "y": 440,
      "rot": 0,
      "props": {
        "v": 0,
        "ac": false,
        "f": 50,
        "n": false,
        "owner": "",
        "rsrc": 0.1,
        "len": 1000,
        "rating": 0,
        "label": ""
      }
    },
    {
      "id": "R4",
      "kind": "rail",
      "x": 1280,
      "y": 570,
      "rot": 0,
      "props": {
        "v": 0,
        "ac": false,
        "f": 50,
        "n": false,
        "owner": "",
        "rsrc": 0.1,
        "len": 1000,
        "rating": 0,
        "label": ""
      }
    },
    {
      "id": "S1",
      "kind": "switch",
      "x": 910,
      "y": 260,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "K1",
      "kind": "coil",
      "x": 910,
      "y": 510,
      "rot": 0,
      "props": {
        "r": 2400,
        "pickup": 18,
        "release": 6,
        "ton": 0,
        "toff": 1,
        "rating": 0,
        "label": "T.OFF"
      }
    },
    {
      "id": "S2",
      "kind": "switch",
      "x": 1040,
      "y": 260,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "K2",
      "kind": "coil",
      "x": 1040,
      "y": 510,
      "rot": 0,
      "props": {
        "r": 2400,
        "pickup": 18,
        "release": 6,
        "ton": 1,
        "toff": 0,
        "rating": 0,
        "label": "T.ON"
      }
    },
    {
      "id": "S3",
      "kind": "switch",
      "x": 1140,
      "y": 380,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "K1",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "S4",
      "kind": "switch",
      "x": 1240,
      "y": 260,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "K2",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "S5",
      "kind": "switch",
      "x": 1240,
      "y": 380,
      "rot": 0,
      "props": {
        "closed": true,
        "owner": "K3",
        "nc": true,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "K3",
      "kind": "coil",
      "x": 1190,
      "y": 510,
      "rot": 0,
      "props": {
        "r": 2400,
        "pickup": 18,
        "release": 6,
        "ton": 0,
        "toff": 0,
        "rating": 0,
        "label": "RL"
      }
    },
    {
      "id": "S6",
      "kind": "switch",
      "x": 1340,
      "y": 260,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "K2",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "S7",
      "kind": "switch",
      "x": 1340,
      "y": 380,
      "rot": 0,
      "props": {
        "closed": true,
        "owner": "K3",
        "nc": true,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "O1",
      "kind": "out",
      "x": 1340,
      "y": 510,
      "rot": 0,
      "props": {
        "r": 2400,
        "label": "DOWN"
      }
    },
    {
      "id": "S8",
      "kind": "switch",
      "x": 1470,
      "y": 260,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "K1",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "O2",
      "kind": "out",
      "x": 1470,
      "y": 510,
      "rot": 0,
      "props": {
        "r": 2400,
        "label": "UP"
      }
    },
    {
      "id": "J1",
      "kind": "passive",
      "x": 1600,
      "y": 510,
      "rot": 0,
      "props": {
        "r": 0,
        "c": 0,
        "l": 0,
        "rating": 0,
        "ratingW": 0,
        "label": ""
      }
    },
    {
      "id": "X2",
      "kind": "passive",
      "x": 1730,
      "y": 260,
      "rot": 0,
      "props": {
        "r": 0,
        "c": 0,
        "l": 500,
        "rating": 0,
        "ratingW": 0,
        "label": ""
      }
    },
    {
      "id": "X5",
      "kind": "led",
      "x": 1730,
      "y": 510,
      "rot": 0,
      "props": {
        "r": 1200,
        "rating": 0,
        "label": ""
      }
    },
    {
      "id": "X6",
      "kind": "passive",
      "x": 1730,
      "y": 390,
      "rot": 0,
      "props": {
        "r": 480,
        "c": 0,
        "l": 0,
        "rating": 0,
        "ratingW": 0,
        "label": "R 480"
      }
    },
    {
      "id": "R5",
      "kind": "rail",
      "x": 1620,
      "y": 750,
      "rot": 0,
      "props": {
        "v": 220,
        "ac": true,
        "f": 60,
        "n": false,
        "owner": "",
        "rsrc": 0.1,
        "len": 320,
        "rating": 0,
        "label": "MAIN"
      }
    },
    {
      "id": "R6",
      "kind": "rail",
      "x": 1630,
      "y": 1070,
      "rot": 0,
      "props": {
        "v": 0,
        "ac": true,
        "f": 50,
        "n": true,
        "owner": "R7",
        "rsrc": 0.1,
        "len": 320,
        "rating": 0,
        "label": "GENSET"
      }
    },
    {
      "id": "R7",
      "kind": "rail",
      "x": 1620,
      "y": 800,
      "rot": 0,
      "props": {
        "v": 220,
        "ac": true,
        "f": 60,
        "n": false,
        "owner": "",
        "rsrc": 0.1,
        "len": 320,
        "rating": 0,
        "label": "GENSET"
      }
    },
    {
      "id": "R8",
      "kind": "rail",
      "x": 1630,
      "y": 1110,
      "rot": 0,
      "props": {
        "v": 0,
        "ac": true,
        "f": 50,
        "n": true,
        "owner": "R5",
        "rsrc": 0.1,
        "len": 320,
        "rating": 0,
        "label": "MAIN"
      }
    },
    {
      "id": "X7",
      "kind": "led",
      "x": 1640,
      "y": 940,
      "rot": 0,
      "props": {
        "r": 1200,
        "rating": 0,
        "label": ""
      }
    },
    {
      "id": "S9",
      "kind": "switch",
      "x": 1690,
      "y": 860,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "K7",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "S10",
      "kind": "switch",
      "x": 1590,
      "y": 860,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "K4",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "S11",
      "kind": "switch",
      "x": 1690,
      "y": 1020,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "K7",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "S12",
      "kind": "switch",
      "x": 1590,
      "y": 1020,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "K4",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": ""
      }
    },
    {
      "id": "R9",
      "kind": "rail",
      "x": 1090,
      "y": 750,
      "rot": 0,
      "props": {
        "v": 24,
        "ac": false,
        "f": 50,
        "n": false,
        "owner": "",
        "rsrc": 0.1,
        "len": 630,
        "rating": 0,
        "label": ""
      }
    },
    {
      "id": "R10",
      "kind": "rail",
      "x": 1090,
      "y": 1110,
      "rot": 0,
      "props": {
        "v": 0,
        "ac": false,
        "f": 50,
        "n": false,
        "owner": "",
        "rsrc": 0.1,
        "len": 640,
        "rating": 0,
        "label": ""
      }
    },
    {
      "id": "K4",
      "kind": "coil",
      "x": 950,
      "y": 980,
      "rot": 0,
      "props": {
        "r": 2400,
        "pickup": 18,
        "release": 6,
        "ton": 0,
        "toff": 0,
        "rating": 0,
        "label": "MAIN"
      }
    },
    {
      "id": "S13",
      "kind": "switch",
      "x": 950,
      "y": 850,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": "MAIN POWER"
      }
    },
    {
      "id": "K7",
      "kind": "coil",
      "x": 1140,
      "y": 980,
      "rot": 0,
      "props": {
        "r": 2400,
        "pickup": 18,
        "release": 6,
        "ton": 0,
        "toff": 0,
        "rating": 0,
        "label": "GENST"
      }
    },
    {
      "id": "S14",
      "kind": "switch",
      "x": 1140,
      "y": 850,
      "rot": 0,
      "props": {
        "closed": false,
        "owner": "",
        "nc": false,
        "arc": 0,
        "bounce": 0,
        "label": "GENERATOR"
      }
    },
    {
      "id": "L2",
      "kind": "label",
      "x": 780,
      "y": 160,
      "rot": 0,
      "props": {
        "text": ">> SAMPLE TIMER RELAY",
        "label": ""
      }
    },
    {
      "id": "L3",
      "kind": "label",
      "x": 780,
      "y": 710,
      "rot": 0,
      "props": {
        "text": ">> SAMPLE AC SOURCE CRASHES",
        "label": ""
      }
    }
  ],
  "wires": [
    {
      "id": "W1",
      "a": {
        "part": "R1",
        "pin": "tap",
        "t": -370
      },
      "b": {
        "part": "S1",
        "pin": 0
      }
    },
    {
      "id": "W2",
      "a": {
        "part": "S1",
        "pin": 1
      },
      "b": {
        "part": "K1",
        "pin": 0
      }
    },
    {
      "id": "W3",
      "a": {
        "part": "K1",
        "pin": 1
      },
      "b": {
        "part": "R4",
        "pin": "tap",
        "t": -370
      }
    },
    {
      "id": "W4",
      "a": {
        "part": "R1",
        "pin": "tap",
        "t": -240
      },
      "b": {
        "part": "S2",
        "pin": 0
      }
    },
    {
      "id": "W5",
      "a": {
        "part": "S2",
        "pin": 1
      },
      "b": {
        "part": "K2",
        "pin": 0
      }
    },
    {
      "id": "W6",
      "a": {
        "part": "K2",
        "pin": 1
      },
      "b": {
        "part": "R4",
        "pin": "tap",
        "t": -240
      }
    },
    {
      "id": "W8",
      "a": {
        "part": "S3",
        "pin": 1
      },
      "b": {
        "part": "K3",
        "pin": 0
      },
      "jog": 410
    },
    {
      "id": "W9",
      "a": {
        "part": "R1",
        "pin": "tap",
        "t": -40
      },
      "b": {
        "part": "S4",
        "pin": 0
      }
    },
    {
      "id": "W10",
      "a": {
        "part": "S4",
        "pin": 1
      },
      "b": {
        "part": "S5",
        "pin": 0
      }
    },
    {
      "id": "W11",
      "a": {
        "part": "S5",
        "pin": 1
      },
      "b": {
        "part": "K3",
        "pin": 0
      },
      "jog": 410
    },
    {
      "id": "W13",
      "a": {
        "part": "R1",
        "pin": "tap",
        "t": 60
      },
      "b": {
        "part": "S6",
        "pin": 0
      }
    },
    {
      "id": "W14",
      "a": {
        "part": "S6",
        "pin": 1
      },
      "b": {
        "part": "S7",
        "pin": 0
      }
    },
    {
      "id": "W15",
      "a": {
        "part": "S7",
        "pin": 1
      },
      "b": {
        "part": "O1",
        "pin": 0
      }
    },
    {
      "id": "W16",
      "a": {
        "part": "O1",
        "pin": 1
      },
      "b": {
        "part": "R4",
        "pin": "tap",
        "t": 60
      }
    },
    {
      "id": "W18",
      "a": {
        "part": "S8",
        "pin": 1
      },
      "b": {
        "part": "O2",
        "pin": 0
      }
    },
    {
      "id": "W19",
      "a": {
        "part": "O2",
        "pin": 1
      },
      "b": {
        "part": "R4",
        "pin": "tap",
        "t": 190
      }
    },
    {
      "id": "W21-i9qq",
      "a": {
        "part": "K3",
        "pin": 1
      },
      "b": {
        "part": "R4",
        "pin": "tap",
        "t": -90
      }
    },
    {
      "id": "W21-g3bd",
      "a": {
        "part": "S3",
        "pin": 0
      },
      "b": {
        "part": "R1",
        "pin": "tap",
        "t": -140
      }
    },
    {
      "id": "W21-7r46",
      "a": {
        "part": "S8",
        "pin": 0
      },
      "b": {
        "part": "R1",
        "pin": "tap",
        "t": 190
      }
    },
    {
      "id": "W20-v2kj",
      "a": {
        "part": "J1",
        "pin": 0
      },
      "b": {
        "part": "R3",
        "pin": "tap",
        "t": 320
      }
    },
    {
      "id": "W21-jkbd",
      "a": {
        "part": "J1",
        "pin": 1
      },
      "b": {
        "part": "J1",
        "pin": 1
      }
    },
    {
      "id": "W22-kzha",
      "a": {
        "part": "J1",
        "pin": 1
      },
      "b": {
        "part": "R4",
        "pin": "tap",
        "t": 320
      }
    },
    {
      "id": "W25-hiy4",
      "a": {
        "part": "X2",
        "pin": 0
      },
      "b": {
        "part": "R1",
        "pin": "tap",
        "t": 450
      }
    },
    {
      "id": "W26-6qas",
      "a": {
        "part": "X5",
        "pin": 1
      },
      "b": {
        "part": "R4",
        "pin": "tap",
        "t": 450
      }
    },
    {
      "id": "W27-lkk0",
      "a": {
        "part": "J1",
        "pin": 0
      },
      "b": {
        "part": "J1",
        "pin": 0
      }
    },
    {
      "id": "W26-7ey4",
      "a": {
        "part": "X2",
        "pin": 1
      },
      "b": {
        "part": "X6",
        "pin": 0
      }
    },
    {
      "id": "W27-xmus",
      "a": {
        "part": "X6",
        "pin": 1
      },
      "b": {
        "part": "X5",
        "pin": 0
      }
    },
    {
      "id": "W28-j3nt",
      "a": {
        "part": "X6",
        "pin": 1
      },
      "b": {
        "part": "X6",
        "pin": 0
      }
    },
    {
      "id": "W28",
      "a": {
        "part": "S9",
        "pin": 0
      },
      "b": {
        "part": "R7",
        "pin": "tap",
        "t": 70
      }
    },
    {
      "id": "W29",
      "a": {
        "part": "S10",
        "pin": 1
      },
      "b": {
        "part": "X7",
        "pin": 0
      }
    },
    {
      "id": "W30",
      "a": {
        "part": "S10",
        "pin": 0
      },
      "b": {
        "part": "R5",
        "pin": "tap",
        "t": -30
      }
    },
    {
      "id": "W34-7vmi",
      "a": {
        "part": "S9",
        "pin": 1
      },
      "b": {
        "pin": "wire",
        "wire": "W29",
        "f": 0.7884615384615384
      }
    },
    {
      "id": "W35-oal6",
      "a": {
        "part": "S12",
        "pin": 1
      },
      "b": {
        "part": "R8",
        "pin": "tap",
        "t": -40
      }
    },
    {
      "id": "W35-mu0t",
      "a": {
        "part": "S11",
        "pin": 1
      },
      "b": {
        "part": "R6",
        "pin": "tap",
        "t": 60
      }
    },
    {
      "id": "W35-68po",
      "a": {
        "part": "S12",
        "pin": 0
      },
      "b": {
        "part": "X7",
        "pin": 1
      }
    },
    {
      "id": "W36-y0z6",
      "a": {
        "part": "S11",
        "pin": 0
      },
      "b": {
        "part": "X7",
        "pin": 1
      }
    },
    {
      "id": "W37-h1tb",
      "a": {
        "part": "S13",
        "pin": 1
      },
      "b": {
        "part": "K4",
        "pin": 0
      }
    },
    {
      "id": "W37",
      "a": {
        "part": "S14",
        "pin": 1
      },
      "b": {
        "part": "K7",
        "pin": 0
      }
    },
    {
      "id": "W39-byct",
      "a": {
        "part": "K4",
        "pin": 1
      },
      "b": {
        "part": "R10",
        "pin": "tap",
        "t": -140
      }
    },
    {
      "id": "W40-ua3e",
      "a": {
        "part": "K7",
        "pin": 1
      },
      "b": {
        "part": "R10",
        "pin": "tap",
        "t": 50
      }
    },
    {
      "id": "W41-trmg",
      "a": {
        "part": "S13",
        "pin": 0
      },
      "b": {
        "part": "R9",
        "pin": "tap",
        "t": -140
      }
    },
    {
      "id": "W42-lw49",
      "a": {
        "part": "S14",
        "pin": 0
      },
      "b": {
        "part": "R9",
        "pin": "tap",
        "t": 50
      }
    }
  ]
};
}
