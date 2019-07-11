(function (window, document, synth, MIDIKeys, Delay) {
    'use strict';

    window.NodeList.prototype.forEach = Array.prototype.forEach;
    window.NodeList.prototype.map = Array.prototype.map;

    var armedControl = null;
    var context = window.audioContext = new window.AudioContext();
    var buffer = context.createGain();
    var delay = Delay.create(context);
    buffer.gain.value = 0.5;
    buffer.connect(context.destination);

    delay.connect(buffer);
    delay.delayGain.value = 0;

    var s = new synth.Synth({
        context : context
    });
    s.connect(delay.input);

    function scaleTo100(min, max, value) {
        return synth.scaleTo(min, max, value, 0, 100);
    }

    function scaleFrom100(min, max, value) {
        return synth.scaleTo(0, 100, value, min, max);
    }

    function stepValue(value, el) {
        var max = parseFloat(el.max),
            min = parseFloat(el.min),
            steps = JSON.parse(el.dataset.steps);
        return synth.stepValue(min, max, value, steps);
    }

    function unstepValue(el) {
        var value = parseFloat(el.value),
            max = parseFloat(el.max),
            min = parseFloat(el.min),
            steps = JSON.parse(el.dataset.steps);
        return synth.unstepValue(min, max, value, steps);
    }

    function ready(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    function handleMidiMessage(midiEvent) {
        if (synth.MIDI.isMessageType(synth.MIDI.CONTROL_CHANGE, midiEvent)) {
            if (armedControl) {
                s.assignControlChange(midiEvent.data[1], armedControl.dataset.param, armedControl.dataset.parentParam);
                armedControl = null;
            }
        }
        s.send(midiEvent.data, midiEvent.timestamp);
    }

    function setupMidi() {

        ready(function () {
            if (typeof MIDIKeys !== 'undefined') {
                var midiKeys = new MIDIKeys(document.body, {
                    noteOnVelocity : 0x0f
                });
                midiKeys.option('onmidimessage', handleMidiMessage);
            }
        });

        window.navigator.requestMIDIAccess({
            sysex : true
        }).then(function (midiAccess) {

            if (midiAccess.sysexEnabled) {
                window.console.log('MIDI access acquired with SYSEX enabled');
            } else {
                window.console.log('MIDI access acquired');
            }

            if (midiAccess.inputs.size > 0) {
                var input = midiAccess.inputs.get(0);
                if (input.state === 'connected') {
                    window.console.log([
                        'Attempting to open connected MIDI device',
                        input.name,
                        'with connection state',
                        JSON.stringify(input.connection)
                    ].join(' '));
                    input.open().then(function () {
                        window.console.log([
                            'Opened MIDI device',
                            input.name,
                            'by',
                            input.manufacturer
                        ].join(' '));
                        input.onmidimessage = handleMidiMessage;
                    });
                }
            }
        }, function (error) {
            window.console.error('Unabled to acquire MIDI access', error);
        });
    }

    ready(function () {

        setupMidi();

        var form = document.querySelector('form');

        form.querySelector('#cc-arm').addEventListener('click', function () {
            form.classList.toggle('cc-armed');

            var armed = form.classList.contains('cc-armed');
            if (armed) {
                armedControl = null;
            }
            form.querySelectorAll('fieldset').forEach(function (fieldset) {
                if (armed) {
                    fieldset.disabled = 'disabled';
                } else {
                    fieldset.removeAttribute('disabled');
                }
            });
        });

        form.addEventListener('click', function (event) {
            if (form.classList.contains('cc-armed')) {
                if (event.target.id !== 'cc-arm') {
                    var control = event.path.find(function (el) {
                        if (el.classList) {
                            return el.classList.contains('control-group-assignable');
                        }
                    });
                    if (control) {
                        armedControl = control;
                    }
                    form.classList.remove('cc-armed');
                    form.querySelectorAll('fieldset').forEach(function (fieldset) {
                        fieldset.removeAttribute('disabled');
                    });
                }
            }
        });

        var volumeControl = form.querySelector('#volume'),
            volumeDisplay = form.querySelector('#volume-display');
        volumeControl.value = buffer.gain.value * 100;
        volumeDisplay.textContent = Math.round(buffer.gain.value * 10);
        volumeControl.addEventListener('input', function () {
            buffer.gain.value = volumeControl.value / 100;
            volumeDisplay.textContent = Math.round(buffer.gain.value * 10);
        });

        document.getElementsByName('filter-type').forEach(function (el) {
            if (el.value === s.filterType) {
                el.checked = true;
            }
            el.addEventListener('click', function () {
                s.filterType = el.value;
            });
        });

        var filterQControl = form.querySelector('#q');
        filterQControl.value = synth.scaleTo(0, 10, s.filterQ, 0, 100);
        filterQControl.addEventListener('input', function () {
            s.filterQ = synth.scaleTo(0, 100, filterQControl.value, 0, 10);
        });

        function frequencyString(f) {
            if (f >= 1000) {
                return (f / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
            }

            if (f < 3) {
                return f.toFixed(1);
            }

            return Math.round(f).toString();
        }

        var filterFrequencyControl = form.querySelector('#freq'),
            filterFrequencyDisplay = form.querySelector('#freq-display');
        filterFrequencyControl.value = stepValue(s.filterFrequency, filterFrequencyControl);
        filterFrequencyDisplay.textContent = frequencyString(s.filterFrequency);

        filterFrequencyControl.addEventListener('input', function () {
            s.filterFrequency = unstepValue(filterFrequencyControl);
            filterFrequencyDisplay.textContent = frequencyString(s.filterFrequency);
        });

        var lfoFreqControl = form.querySelector('#lfo-freq'),
            lfoFreqDisplay = form.querySelector('#lfo-freq-display');

        lfoFreqControl.value = stepValue(s.lfo.frequency, lfoFreqControl);
        lfoFreqDisplay.textContent = frequencyString(s.lfo.frequency);

        lfoFreqControl.addEventListener('input', function () {
            s.lfo.frequency = unstepValue(lfoFreqControl);
            lfoFreqDisplay.textContent = frequencyString(s.lfo.frequency);
        });

        var lfoAmpControl = form.querySelector('#lfo-amp');
        lfoAmpControl.value = scaleTo100(0, 10, s.lfo.amplitude);
        lfoAmpControl.addEventListener('input', function () {
            s.lfo.amplitude = scaleFrom100(0, 10, lfoAmpControl.value);
        });

        ['osc1', 'osc2'].forEach(function (key) {

            var osc = form.querySelector('#' + key);

            function subKey(value) {
                return '[name="' + [key, value].join('-') + '"]';
            }

            osc.querySelectorAll(subKey('octave')).forEach(function (el) {
                var octave = String(s[key].octave);
                if (el.value === octave) {
                    el.checked = true;
                }
                el.addEventListener('click', function () {
                    s[key].octave = parseFloat(el.value);
                });
            });

            osc.querySelectorAll(subKey('wave-type')).forEach(function (el) {
                if (el.value === s[key].type) {
                    el.checked = true;
                }
                el.addEventListener('click', function () {
                    s[key].type = el.value;
                });
            });
        });

        var envelopControlsTemplate = document.querySelector('#envelope-controls-template');

        ['filterEnvelope', 'volumeEnvelope'].forEach(function (key) {
            var el = form.querySelector('#' + key),
                envelope = s[key];

            el.appendChild(document.importNode(envelopControlsTemplate.content, true));

            function envelopeTimeString(x) {
                if (x < 0.1) {
                    return Math.round(x * 1000) + ' m-sec.';
                }

                if (x < 1) {
                    return x.toFixed(1) + ' sec.';
                }

                return Math.round(x) + ' sec.';
            }

            function setText(displayEl, param) {
                if (param === 'sustain') {
                    displayEl.textContent = Math.round(envelope.sustain * 10);
                } else {
                    displayEl.textContent = envelopeTimeString(envelope[param]);
                }
            }

            el.querySelectorAll('.control-group-assignable').forEach(function (controlGroupEl) {
                controlGroupEl.dataset.parentParam = key;
            });

            ['attack', 'decay', 'sustain', 'release'].forEach(function (param) {
                var controlEl = el.querySelector('.' + param + '-control'),
                    displayEl = el.querySelector('.' + param + '-display');
                setText(displayEl, param);
                controlEl.value = stepValue(envelope[param], controlEl);
            });

            el.addEventListener('input', function (e) {
                var param = e.target.dataset.param,
                    displayEl = el.querySelector('.' + param + '-display');
                if (param) {
                    envelope[param] = unstepValue(e.target);
                    setText(displayEl, param);
                }
            });
        });

        document.getElementsByName('lfo-wave-type').forEach(function (el) {
            if (el.value === s.lfo.type) {
                el.checked = true;
            }
            el.addEventListener('click', function () {
                s.lfo.type = el.value;
            });
        });

    });

}(window, window.document, window.synth, window.MIDIKeys, window.Delay));
