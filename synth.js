/**
 * jquery.midikeys.js
 * (c) 2012 Michael Dominice
 * jquery.midikeys.js is freely distributable under the MIT license.
 */
(function (root, factory) {
    'use strict';

    const libaryName = 'synth';
    if (typeof define !== 'undefined' && define.amd) {
        define([], function () {
            root[libaryName] = factory(root);
            return root[libaryName];
        });
    } else {
        root[libaryName] = factory(root);
        return root[libaryName];
    }
}(this, function (window) {
    'use strict';

    const MIDI = Object.defineProperties({}, {
        NOTE_ON : {
            value : 0x90,
            writeable : false,
            enumerable : true
        },
        NOTE_OFF : {
            value : 0x80,
            writeable : false,
            enumerable : true
        },
        POLYPHONIC_KEY_PRESSURE : {
            value : 0xa0,
            writeable : false,
            enumerable : true
        },
        CONTROL_CHANGE : {
            value : 0xb0,
            writeable : false,
            enumerable : true
        },
        PROGRAM_CHANGE : {
            value : 0xc0,
            writeable : false,
            enumerable : true
        },
        CHANNEL_PRESSURE : {
            value : 0xd0,
            writeable : false,
            enumerable : true
        },
        PITCH_BEND_CHANGE : {
            value : 0xe0,
            writeable : false,
            enumerable : true
        },
        getMessageType : {
            value : function (midiEvent) {
                return midiEvent.data[0] & 0xf0;
            },
            writeable : false
        },
        isMessageType : {
            value : function (type, midiEvent) {
                return MIDI.getMessageType(midiEvent) === type;
            },
            writeable : false
        }
    });

    const MAX_VELOCITY = 0x7f,
        KEY_PREFIX = '';

    const WAVE_TYPES = {
        SINE : 'sine',
        SQUARE : 'square',
        SAWTOOTH : 'sawtooth',
        TRIANGLE : 'triangle'
    };

    const FILTER_TYPES = {
        LOWPASS : 'lowpass',
        HIGHPASS : 'highpass',
        BANDPASS : 'bandpass',
        LOWSHELF : 'lowshelf',
        HIGHSHELF : 'highshelf',
        PEAKING : 'peaking',
        NOTCH : 'notch',
        ALLPASS : 'allpass'
    };

    function scaleTo(inMin, inMax, value, outMin, outMax) {
        const inRange = inMax - inMin,
            outRange = outMax - outMin,
            slope = outRange / inRange;
        return (slope * (value - inMin)) + outMin;
    }

    function stepValue(min, max, value, steps) {
        const rangeSize = (max - min) / (steps.length - 1);
        for (var i = 1; i < steps.length; i = i + 1) {
            if (value <= steps[i]) {
                return scaleTo(steps[i - 1], steps[i], value, min + (rangeSize * (i - 1)), min + (rangeSize * i));
            }
        }
    }

    function unstepValue(min, max, value, steps) {
        const rangeSize = (max - min) / (steps.length - 1);
        for (var i = 1; i < steps.length; i = i + 1) {
            if (value <= (min + (i * rangeSize))) {
                return scaleTo(min + ((i - 1) * rangeSize), min + (i * rangeSize), value, steps[i - 1], steps[i]);
            }
        }
    }

    function midiNoteToFrequency(note, octaveAdjust) {
        return 440 * Math.pow(2, ((note + ((octaveAdjust || 0) * 12)) - 69) / 12.0);
    }

    function slice(array, start, end) {
        return Array.prototype.slice.call(array, start, end);
    }

    function extend(object) {
        return slice(arguments, 1).reduce(function (result, arg) {
            for (var key in arg) {
                result[key] = arg[key];
            }
            return result;
        }, object);
    }

    function getDefaultNumber(value, defaultValue) {
        if (typeof value === 'number') {
            return value;
        }
        return defaultValue;
    }

    function ADSREnvelopeConfig(options) {
        var config = this;
        Object.keys(ADSREnvelopeConfig.defaults).forEach(function (key) {
            var value;
            var defaultValue = ADSREnvelopeConfig.defaults[key];
            if (options) {
                value = options[key];
            }
            config[key] = getDefaultNumber(value, defaultValue);
        });
    }

    ADSREnvelopeConfig.defaults = {
        attack : 0.1,
        decay : 0.1,
        sustain : 1,
        release : 0.1
    };

    function ADSREnvelope(context, options) {

        options = extend({}, ADSREnvelope.defaults, options);
        var config = options.config;

        Object.defineProperties(this, {
            max : {
                enumerable : true,
                get : function () {
                    return options.max;
                },
                set : function (value) {
                    options.max = value;
                }
            },
            min : {
                enumerable : true,
                get : function () {
                    return options.min;
                },
                set : function (value) {
                    options.min = value;
                }
            },
            config : {
                enumerable : true,
                get : function () {
                    return config;
                }
            }
        });

        if (!options.config) {
            throw new Error('no config provided');
        }

        this.noteOn = function (param) {
            const now = context.currentTime;
            param.cancelScheduledValues(now);
            param.setValueAtTime(options.min, now);
            param.linearRampToValueAtTime(options.max, now + config.attack);
            param.linearRampToValueAtTime(config.sustain * options.max, now + config.attack + config.decay);
        };

        this.noteOff = function (param) {
            const now = context.currentTime;
            const value = param.value;
            param.cancelScheduledValues(now);
            param.setValueAtTime(value, now);
            param.linearRampToValueAtTime(options.min, now + config.release);
        };
    }

    ADSREnvelope.defaults = {
        max : 1.0,
        min : 0.0
    };

    function OscillatorNote(context, note, options) {
        var opts = extend({}, OscillatorNote.defaults, options);
        var maxGain = opts.velocity / MAX_VELOCITY;

        var volumeEnvelopeOptions = extend({}, opts.volumeEnvelope, {
            max : maxGain,
            config : options.volumeEnvelope
        });

        var filterEnvelopeOptions = extend({}, opts.filterFreq, {
            min : 0,
            max : opts.filterFrequency,
            config : options.filterEnvelope
        });

        var gain = context.createGain();

        var filter = context.createBiquadFilter();

        var oscillatorNode = context.createOscillator();
        oscillatorNode.type = opts.type;
        oscillatorNode.start();

        function setOscillatorFrequency() {
            oscillatorNode.frequency.value = midiNoteToFrequency(note, opts.octave);
        }

        var volumeEnvelope = new ADSREnvelope(context, volumeEnvelopeOptions);
        var filterEnvelope = new ADSREnvelope(context, filterEnvelopeOptions);
        oscillatorNode.connect(filter);
        filter.connect(gain);
        setOscillatorFrequency();

        Object.defineProperties(this, {
            gain : {
                get : function () {
                    return gain;
                }
            },
            filterFrequency : {
                get : function () {
                    return filterEnvelope.max;
                },
                set : function (value) {
                    filterEnvelope.max = value;
                }
            },
            frequency : {
                enumerable : true,
                get : function () {
                    return oscillatorNode.frequency;
                }
            },
            type : {
                enumerable : true,
                get : function () {
                    return oscillatorNode.type;
                },
                set : function (value) {
                    oscillatorNode.type = value;
                }
            },
            octave : {
                enumerable : true,
                get : function () {
                    return opts.octave;
                },
                set : function (value) {
                    opts.octave = value;
                    setOscillatorFrequency();
                }
            }
        });

        this.noteOn = function () {
            volumeEnvelope.noteOn(gain.gain);
            filterEnvelope.noteOn(filter.frequency);
        };

        this.noteOff = function () {
            volumeEnvelope.noteOff(gain.gain);
            filterEnvelope.noteOff(filter.frequency);
        };

    }

    OscillatorNote.prototype.connect = function () {
        return this.gain.connect.apply(this.gain, arguments);
    };

    OscillatorNote.prototype.disconnect = function () {
        return this.gain.disconnect.apply(this.gain, arguments);
    };

    OscillatorNote.defaults = {
        velocity : MAX_VELOCITY,
        volumeEnvelope : extend({}, ADSREnvelope.defaults),
        filterEnvelope : extend({}, ADSREnvelope.defaults),
        type : WAVE_TYPES.SINE,
        octave : 0
    };

    var handlers = {};

    handlers[MIDI.NOTE_ON] = function noteOn(opts) {
        var note = opts.data[1],
            velocity = opts.data[2];
        var key = KEY_PREFIX + note;
        if (!opts.oscillators[key]) {
            var oscillator = new OscillatorNote(opts.context, note, {
                type : opts.options.type,
                velocity : velocity,
                filterFrequency : opts.options.filterFrequency,
                volumeEnvelope : opts.options.volumeEnvelope,
                filterEnvelope : opts.options.filterEnvelope,
                octave : opts.options.octave
            });
            opts.oscillators[key] = oscillator;
            oscillator.connect(opts.dest);
        }
        opts.oscillators[key].noteOn(0);
    };

    handlers[MIDI.NOTE_OFF] = function noteOff(opts) {
        var note = opts.data[1],
            velocity = opts.data[2];
        var key = KEY_PREFIX + note;
        if (opts.oscillators[key]) {
            var oscillator = opts.oscillators[key];
            oscillator.noteOff(velocity);
        }
    };

    function getSynthOptions(opts) {
        var options = {};
        options.type = opts.type || SYNTH_DEFAULTS.type;
        options.filterType = opts.filterType || SYNTH_DEFAULTS.filterType;
        options.filterFrequency = opts.filterFrequency || SYNTH_DEFAULTS.filterFrequency;
        options.octave = opts.octave || 0;
        return options;
    }

    function LFO(context) {

        var lfo = context.createOscillator();
        lfo.type = WAVE_TYPES.SINE;
        lfo.frequency.value = 4;

        var lfoGain = context.createGain();
        lfoGain.gain.value = 1;

        lfo.connect(lfoGain);
        lfo.start();

        Object.defineProperties(this, {
            type : {
                get : function () {
                    return lfo.type;
                },
                set : function (value) {
                    lfo.type = value;
                },
                enumerable : true
            },
            frequency : {
                get : function () {
                    return lfo.frequency.value;
                },
                set : function (value) {
                    lfo.frequency.value = value;
                },
                enumerable : true
            },
            amplitude : {
                get : function () {
                    return lfoGain.gain.value;
                },
                set : function (value) {
                    lfoGain.gain.value = value;
                },
                enumerable : true
            }
        });

        this.connect = function () {
            return lfoGain.connect.apply(lfoGain, arguments);
        };

        this.disconnect = function () {
            return lfoGain.disconnect.apply(lfoGain, arguments);
        };

        this.start = function () {
            return lfo.start.apply(lfo, arguments);
        };

        this.stop = function () {
            return lfo.stop.apply(lfo, arguments);
        };
    }

    function Oscillator(options) {

        var context = options.context;
        var gain = context.createGain();
        var oscillators = {};

        this.connect = function () {
            return gain.connect.apply(gain, arguments);
        };

        this.disconnect = function () {
            return gain.disconnect.apply(gain, arguments);
        };

        Object.defineProperties(this, {
            octave : {
                enumerable : true,
                get : function () {
                    return options.octave;
                },
                set : function (value) {
                    options.octave = parseInt(value, 10);
                    Object.keys(oscillators).forEach(function (key) {
                        var oscillator = oscillators[key];
                        if (oscillator) {
                            oscillator.octave = value;
                        }
                    });
                }
            },
            filterType : {
                enumerable : true,
                get : function () {
                    return options.filterType;
                },
                set : function (value) {
                    options.filterType = value;
                    Object.keys(oscillators).forEach(function (key) {
                        var oscillator = oscillators[key];
                        if (oscillator) {
                            oscillator.filterType = value;
                        }
                    });
                }
            },
            filterFrequency : {
                enumerable : true,
                get : function () {
                    return options.filterFrequency;
                },
                set : function (value) {
                    options.filterFrequency = value;
                    Object.keys(oscillators).forEach(function (key) {
                        var oscillator = oscillators[key];
                        if (oscillator) {
                            oscillator.filterFrequency = value;
                        }
                    });
                }
            },
            type : {
                enumerable : true,
                get : function () {
                    return options.type;
                },
                set : function (value) {
                    options.type = value;
                    Object.keys(oscillators).forEach(function (key) {
                        if (oscillators[key]) {
                            oscillators[key].type = value;
                        }
                    });
                }
            }
        });

        this._send = function (data) {
            var handlerCode = data[0] & 0xf0,
                handler = handlers[handlerCode];
            if (handler) {
                handler({
                    oscillators : oscillators,
                    context : context,
                    dest : gain,
                    options : options,
                    data : data
                });
            }
        };

    }

    Oscillator.prototype.send = function (data) {
        return this._send(data);
    };

    var PARAM_SCALES = [
        {
            param : 'filterFrequency',
            steps : [20, 60, 250, 1000, 4000, 12000]
        },
        {
            param : 'attack',
            steps : [0.01, 0.1, 1, 10]
        },
        {
            param : 'decay',
            steps : [0.01, 0.1, 1, 10]
        },
        {
            param : 'sustain',
            steps : [0, 0.2, 0.4, 0.6, 0.8, 1]
        },
        {
            param : 'release',
            steps : [0.01, 0.1, 1, 10]
        }
    ];

    function Synth(opts) {
        var context = opts.context || new window.AudioContext();
        var options = getSynthOptions(opts);

        var gain = context.createGain();
        var filter = context.createBiquadFilter();
        var lfo = new LFO(context);

        options.context = context;

        var filterEnvelopeConfig = new ADSREnvelopeConfig(opts.filterEnvelope);
        var volumeEnvelopeConfig = new ADSREnvelopeConfig(opts.volumeEnvelope);

        var oscOptions = extend({}, options, {
            volumeEnvelope : volumeEnvelopeConfig,
            filterEnvelope : filterEnvelopeConfig
        });
        var osc1 = new Oscillator(oscOptions);
        var osc2 = new Oscillator(extend({}, oscOptions, {
            octave : 1
        }));

        osc1.connect(gain);
        osc2.connect(gain);

        this._controlChanges = {};

        this.assignControlChange = function (cc, param, parentParam) {
            this._controlChanges[cc] = (this._controlChanges[cc] || []);

            var existing = this._controlChanges[cc].find(function (change) {
                return change.param === param && change.parentParam === parentParam;
            });

            if (!existing) {
                this._controlChanges[cc].push({
                    param : param,
                    parentParam : parentParam
                });
            }
        };

        Object.defineProperties(this, {
            osc1 : {
                value : osc1,
                writeable : false
            },
            osc2 : {
                value : osc2,
                writeable : false
            },
            lfo : {
                value : lfo,
                writeable : false
            },
            context : {
                value : context,
                writeable : false
            },
            filterType : {
                get : function () {
                    return options.filterType;
                },
                set : function (value) {
                    options.filterType = value;
                    osc1.filterType = value;
                    osc2.filterType = value;
                }
            },
            filterFrequency : {
                get : function () {
                    return options.filterFrequency;
                },
                set : function (value) {
                    options.filterFrequency = value;
                    osc1.filterFrequency = value;
                    osc2.filterFrequency = value;
                }
            },
            filterQ : {
                get : function () {
                    return options.filterQ;
                },
                set : function (value) {
                    options.filterQ = value;
                    osc1.filterQ = value;
                    osc2.filterQ = value;
                }
            },
            gain : {
                value : gain,
                writeable : false
            },
            filterEnvelope : {
                value : filterEnvelopeConfig,
                writeable : false
            },
            volumeEnvelope : {
                value : volumeEnvelopeConfig,
                writeable : false
            }
        });

    }

    Synth.prototype.send = function (data) {
        var self = this;

        self.osc1.send(data);
        self.osc2.send(data);

        if (MIDI.isMessageType(MIDI.CONTROL_CHANGE, { data : data})) {
            var controllerNumber = data[1],
                controllerValue = data[2];
            (self._controlChanges[controllerNumber] || []).forEach(function (handler) {
                var target = self;
                if (handler.parentParam) {
                    target = self[handler.parentParam];
                }

                if (target) {
                    var paramScale = PARAM_SCALES.find(function (p) {
                        return p.param === handler.param;
                    });
                    if (paramScale) {
                        target[handler.param] = unstepValue(0, 127, controllerValue, paramScale.steps);
                    }
                }
            });
        }
    };

    Synth.prototype.connect = function () {
        return this.gain.connect.apply(this.gain, arguments);
    };

    Synth.prototype.disconnect = function () {
        return this.gain.connect.apply(this.gain, arguments);
    };

    Object.keys(WAVE_TYPES).forEach(function (key) {
        var value = WAVE_TYPES[key];
        Object.defineProperty(Synth, key, {
            get : function () {
                return value;
            },
            enumerable : true
        });
    });

    Object.keys(FILTER_TYPES).forEach(function (key) {
        var value = FILTER_TYPES[key];
        Object.defineProperty(Synth, key, {
            get : function () {
                return value;
            },
            enumerable : true
        });
    });

    var SYNTH_DEFAULTS = Object.defineProperties({}, {
        type : {
            value : Synth.SINE,
            writeable : false,
            enumerable : true
        },
        filterType : {
            value : Synth.LOWPASS,
            writeable : false,
            enumerable : true
        },
        filterFrequency : {
            value : 650,
            writeable : false,
            enumerable : true
        }
    });

    Object.keys(MIDI).forEach(function (key) {
        Object.defineProperty(Synth, key, {
            get : function () {
                return MIDI[key];
            },
            enumerable : true
        });
    });


    Object.defineProperty(Synth, 'defaults', {
        get : function () {
            return SYNTH_DEFAULTS;
        },
        enumerable : true
    });

    return Object.defineProperties({}, {
        Synth : {
            value : Synth,
            writeable : false,
            enumerable : true
        },
        MIDI : {
            value : MIDI,
            writeable : false,
            enumerable : true
        },
        scaleTo : {
            value : scaleTo,
            writeable : false
        },
        stepValue : {
            value : stepValue,
            writeable : false
        },
        unstepValue : {
            value : unstepValue,
            writeable : false
        }
    });

}));
