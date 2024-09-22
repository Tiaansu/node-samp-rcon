import RconConnection from './rcon.js';

const host = process.argv[2];
const password = process.argv[3];
const command = process.argv[4];

if (!host || !password) {
    console.error('Usage: samp-rcon <host> <password> [command]');
    process.exit(1);
}

const rcon = new RconConnection(host, null, password);
let closeTimeout = null;

if (!command) {
    console.log('Connecting...');
}

rcon.on('ready', () => {
    if (command) {
        rcon.send(command);
        return;
    }

    console.log('Connected!');

    process.stdin.resume();
    process.stdin.setEncoding('binary');

    process.stdin.on('data', (chunk) => {
        const messages = chunk.trim().split(/[\r\n]+/);

        messages.forEach((msg) => {
            rcon.send(msg);

            if (msg === 'quit') {
                process.exit();
            }
        });
    });
})
    .on('message', (msg) => {
        console.log(msg.trimRight());

        if (command) {
            if (closeTimeout !== null) {
                clearTimeout(closeTimeout);
            }

            closeTimeout = setTimeout(rcon.close.bind(rcon), 250);
        }
    })
    .on('error', (error) => {
        let message;

        if (error.code === 'ENOTFOUND') {
            message = `Invalid host (${host})`;
        } else {
            message = error.message;
        }

        if (!rcon.ready) {
            console.log(`Failed to connect: ${message}`);
            process.exit(1);
        } else {
            console.log(`An error occurred: ${message}`);
        }
    })
    .on('close', () => process.exit());
