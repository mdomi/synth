(function (window) {
    'use strict';

    function Delay(context) {
        var output = context.createGain();
        var delay = context.createDelay();
        var delayBuffer = context.createGain();
        var feedback = context.createGain();
        var input = context.createGain();

        input.connect(output);
        input.connect(delay);

        delay.connect(feedback);
        feedback.connect(delay);

        delay.connect(delayBuffer);

        delayBuffer.connect(output);

        feedback.gain.value = 0.5;
        delay.delayTime.value = 0.5 * 1.3;
        delayBuffer.gain.value = 0.7;

        Object.defineProperties(this, {
            input : {
                get : function () {
                    return input;
                }
            },
            delayGain : {
                get : function () {
                    return delayBuffer.gain;
                }
            },
            delayTime : {
                get : function () {
                    return delay.delayTime;
                }
            },
            feedback : {
                get : function () {
                    return feedback.gain;
                }
            },
            connect : {
                writeable : false,
                value : function () {
                    return output.connect.apply(output, arguments);
                }
            },
            disconnect : {
                writeable : false,
                value : function () {
                    return output.disconnect.apply(output, arguments);
                }
            }
        });
    }

    Object.defineProperty(Delay, 'create', {
        enumerable : true,
        writeable : false,
        value : function (context) {
            return new Delay(context || new window.AudioContext());
        }
    });

    window.Delay = Delay;
}(window));
