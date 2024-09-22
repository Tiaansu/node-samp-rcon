const consoleEl = document.querySelector('.rcon-console');
const outputEl = document.querySelector('.output');
const outputPadEl = document.querySelector('.pad');
const outputPreEl = document.querySelector('pre');
const promptEl = document.querySelector('.prompt');

const socket = io(`ws://${location.host}`);
let host = null;
let pass = null;

function reset(reason) {
    outputPreEl.textContent = '';

    if (reason) {
        updateOutput(reason);
    }

    promptEl.disabled = false;
    updateOutput('Host: ');
    host = pass = null;
}

function updateOutput(text, isNextLine = true) {
    if (text) {
        const span = document.createElement('span');

        if (isNextLine) {
            text = `\n${text}`;
        }

        span.textContent = text;
        outputPreEl.appendChild(span);
    }

    const scrollHeight = outputEl.scrollHeight;
    const maxMargin = Math.max(
        -outputPadEl.clientHeight,
        outputPreEl.clientHeight
    );
    outputPadEl.style.marginTop = `${maxMargin}px`;

    outputEl.scrollTop = scrollHeight;
}

updateOutput();

promptEl.addEventListener('keyup', (event) => {
    if (event.which === 13) {
        const value = promptEl.value.trim();

        if (value) {
            if (!host) {
                host = value;

                updateOutput(host, false);
                updateOutput('Password: ');
            } else if (!pass) {
                pass = value;
                updateOutput('Connecting...');
                promptEl.disabled = true;
                socket.emit('rcon-connect', {
                    host,
                    pass,
                });
            } else if (value === 'clear') {
                outputPreEl.textContent = '';
            } else if (value === 'quit') {
                window.close();
            } else {
                updateOutput(`> ${value}`);
                socket.emit('rcon-send', value);
            }

            promptEl.value = '';
        }
    }
});

socket.on('connect', () => (promptEl.disabled = false));

socket.on('rcon-connect', () => {
    promptEl.disabled = false;
    updateOutput('Connected!');
});

socket.on('disconnect', () => (promptEl.disabled = true));

socket.on('rcon-output', (output) => {
    if (output === 'Server closed') {
        reset('Server closed');
    } else {
        updateOutput(`< ${output.replace('\n', '\n< ')}`);
    }
});

socket.on('rcon-error', (error) => {
    let message;

    if (typeof error === 'object') {
        if (error.code === 'ENOTFOUND') {
            message = `Invalid host ${host}`;
        } else {
            message = error.message;
        }
    } else {
        message = error;
    }

    message =
        typeof message === 'string'
            ? message.replace('\n', '\nError: ')
            : message;

    reset(`Error: ${message}`);
});
