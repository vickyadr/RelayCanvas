// Built-in example. Layout follows the reference ladder sketch the user drew:
// four rails, five rungs, two timer relays and two outputs.
// Plain data, so it can be edited here without touching main.js.

export function demoDoc() {
  return {
    version: 1,
    dt: 1,
    parts: [
    {"id": "R1", "kind": "rail", "x": 600, "y": 80, "rot": 0, "props": {"v": 24, "ac": false, "f": 50, "rsrc": 0.1, "len": 1000, "label": ""}},
    {"id": "R2", "kind": "rail", "x": 600, "y": 200, "rot": 0, "props": {"v": 220, "ac": true, "f": 50, "rsrc": 0.1, "len": 1000, "label": ""}},
    {"id": "R3", "kind": "rail", "x": 600, "y": 330, "rot": 0, "props": {"v": 0, "ac": false, "f": 50, "rsrc": 0.1, "len": 1000, "label": ""}},
    {"id": "R4", "kind": "rail", "x": 600, "y": 460, "rot": 0, "props": {"v": 0, "ac": false, "f": 50, "rsrc": 0.1, "len": 1000, "label": ""}},
    {"id": "S1", "kind": "switch", "x": 200, "y": 140, "rot": 0, "props": {"closed": false, "owner": "", "nc": false, "label": ""}},
    {"id": "K1", "kind": "coil", "x": 200, "y": 380, "rot": 0, "props": {"r": 2400, "pickup": 18, "release": 6, "ton": 0, "toff": 1, "rating": 0, "label": "T.OFF"}},
    {"id": "S2", "kind": "switch", "x": 320, "y": 140, "rot": 0, "props": {"closed": false, "owner": "", "nc": false, "label": ""}},
    {"id": "K2", "kind": "coil", "x": 320, "y": 380, "rot": 0, "props": {"r": 2400, "pickup": 18, "release": 6, "ton": 1, "toff": 0, "rating": 0, "label": "T.ON"}},
    {"id": "S3", "kind": "switch", "x": 470, "y": 260, "rot": 0, "props": {"closed": false, "owner": "K1", "nc": false, "label": ""}},
    {"id": "S4", "kind": "switch", "x": 560, "y": 140, "rot": 0, "props": {"closed": false, "owner": "K2", "nc": false, "label": ""}},
    {"id": "S5", "kind": "switch", "x": 560, "y": 260, "rot": 0, "props": {"closed": true, "owner": "K3", "nc": true, "label": ""}},
    {"id": "K3", "kind": "coil", "x": 515, "y": 380, "rot": 0, "props": {"r": 2400, "pickup": 18, "release": 6, "ton": 0, "toff": 0, "rating": 0, "label": "RL"}},
    {"id": "S6", "kind": "switch", "x": 700, "y": 140, "rot": 0, "props": {"closed": false, "owner": "K2", "nc": false, "label": ""}},
    {"id": "S7", "kind": "switch", "x": 700, "y": 260, "rot": 0, "props": {"closed": true, "owner": "K3", "nc": true, "label": ""}},
    {"id": "O1", "kind": "out", "x": 700, "y": 380, "rot": 0, "props": {"r": 2400, "label": "DOWN"}},
    {"id": "S8", "kind": "switch", "x": 860, "y": 140, "rot": 0, "props": {"closed": false, "owner": "K1", "nc": false, "label": ""}},
    {"id": "O2", "kind": "out", "x": 860, "y": 380, "rot": 0, "props": {"r": 2400, "label": "UP"}},
    {"id": "J1", "kind": "passive", "x": 1000, "y": 380, "rot": 0, "props": {"r": 0, "c": 0, "rating": 0, "label": ""}}
    ],
    wires: [
    {"id": "W1", "a": {"part": "R1", "pin": "tap", "t": -400}, "b": {"part": "S1", "pin": 0}},
    {"id": "W2", "a": {"part": "S1", "pin": 1}, "b": {"part": "K1", "pin": 0}},
    {"id": "W3", "a": {"part": "K1", "pin": 1}, "b": {"part": "R4", "pin": "tap", "t": -400}},
    {"id": "W4", "a": {"part": "R1", "pin": "tap", "t": -280}, "b": {"part": "S2", "pin": 0}},
    {"id": "W5", "a": {"part": "S2", "pin": 1}, "b": {"part": "K2", "pin": 0}},
    {"id": "W6", "a": {"part": "K2", "pin": 1}, "b": {"part": "R4", "pin": "tap", "t": -280}},
    {"id": "W7", "a": {"part": "R1", "pin": "tap", "t": -130}, "b": {"part": "S3", "pin": 0}},
    {"id": "W8", "a": {"part": "S3", "pin": 1}, "b": {"part": "K3", "pin": 0}},
    {"id": "W9", "a": {"part": "R1", "pin": "tap", "t": -40}, "b": {"part": "S4", "pin": 0}},
    {"id": "W10", "a": {"part": "S4", "pin": 1}, "b": {"part": "S5", "pin": 0}},
    {"id": "W11", "a": {"part": "S5", "pin": 1}, "b": {"part": "K3", "pin": 0}},
    {"id": "W12", "a": {"part": "K3", "pin": 1}, "b": {"part": "R4", "pin": "tap", "t": -85}},
    {"id": "W13", "a": {"part": "R1", "pin": "tap", "t": 100}, "b": {"part": "S6", "pin": 0}},
    {"id": "W14", "a": {"part": "S6", "pin": 1}, "b": {"part": "S7", "pin": 0}},
    {"id": "W15", "a": {"part": "S7", "pin": 1}, "b": {"part": "O1", "pin": 0}},
    {"id": "W16", "a": {"part": "O1", "pin": 1}, "b": {"part": "R4", "pin": "tap", "t": 100}},
    {"id": "W17", "a": {"part": "R1", "pin": "tap", "t": 260}, "b": {"part": "S8", "pin": 0}},
    {"id": "W18", "a": {"part": "S8", "pin": 1}, "b": {"part": "O2", "pin": 0}},
    {"id": "W19", "a": {"part": "O2", "pin": 1}, "b": {"part": "R4", "pin": "tap", "t": 260}},
    {"id": "W20", "a": {"part": "R3", "pin": "tap", "t": 400}, "b": {"part": "J1", "pin": 0}},
    {"id": "W21", "a": {"part": "J1", "pin": 1}, "b": {"part": "R4", "pin": "tap", "t": 400}}
    ]
  };
}
