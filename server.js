import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import RconConnection from './rcon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const expressApp = express();

expressApp.set('views', path.join(__dirname, './views'));
expressApp.set('view engine', 'ejs');
expressApp.use(express.static(path.join(__dirname, './public')));

expressApp.get('/', (req, res) => {
    res.render('index');
});

const app = createServer(expressApp);
const io = new Server(app, {
    cors: {
        origin: '*',
    },
});

io.on('connection', (socket) => {
    /**
     * @type {RconConnection | null}
     */
    let rcon;

    function closeConnection() {
        if (rcon) {
            rcon.close();
        }

        rcon = null;
    }

    socket
        .on('disconnect', () => closeConnection())
        .on('rcon-connect', (data) => {
            try {
                rcon = new RconConnection(data.host, null, data.pass);
            } catch (error) {
                const { message } = error;
                console.log(message, message.length);
                socket.emit('rcon-error', {
                    message: error.message ?? 'Unknown error',
                });
                return;
            }

            rcon.on('ready', () => socket.emit('rcon-connect'))
                .on('message', (message) => socket.emit('rcon-output', message))
                .on('error', (err) => socket.emit('rcon-error', err))
                .on('close', () => socket.emit('rcon-output', 'Server closed'));
        })
        .on('rcon-send', (str) => {
            if (!rcon) {
                socket.emit('rcon-error', {
                    message: 'Not connected',
                    code: 'NOCONN',
                });
            } else {
                rcon.send(str);
            }
        });
});

const port = +process.argv[2] || 8080;
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
