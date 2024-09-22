import events from 'node:events';
import dgram from 'node:dgram';
import dns from 'node:dns';

const validIp = /^\d+\.\d+\.\d+\.\d+$/;
const getPort = /.*:/;
const getHost = /\s*:.*/;

export default class RconConnection extends events.EventEmitter {
    connectMessage = 'node-rcon connecting';

    /**
     *
     * @param {string | undefined} host
     * @param {string | number | undefined} port
     * @param {string | undefined} password
     * @param {string | undefined} addressOverride
     */
    constructor(host, port, password, addressOverride) {
        super();

        host = host && host.trim();
        port = port || 7777;

        if (!host) {
            throw new Error('Invalid host given.');
        }

        // Check for host:port notation. Overrides the port argument
        if (host.indexOf(':') !== -1) {
            port = +host.replace(getPort, '');
            host = host.replace(getHost, '');
        } else {
            port = +port;
        }

        if (!isFinite(port) || port < 1 || port > 65535) {
            throw new Error(`Invalid port given: ${port}`);
        }

        this.ready = false;
        this.port = port;
        this.password = password;
        this.retryTimeout = null;

        if (host.toLowerCase() === 'localhost') {
            host = '127.0.0.1';
        }

        this.connectToSocket(host, port);

        if (this.addressOverride && !validIp.test(this.addressOverride)) {
            throw new Error('addressOverride must be a valid IPv4 address.');
        }

        this.addressOverride = addressOverride;

        if (validIp.test(host)) {
            this.address = host;
            this.makePrefix();

            process.nextTick(this.sendConnectMessage.bind(this));
        } else {
            dns.resolve4(host, this.hostResolve.bind(this));
        }
    }

    /**
     *
     * @param {string} host
     * @param {number} port
     */
    connectToSocket(host, port) {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.socket = dgram.createSocket('udp4', this.onMessage.bind(this));
    }

    sendConnectMessage() {
        this.retryTimeout = null;

        if (this.ready) {
            return;
        }

        this.send(`echo ${this.connectMessage}`);

        this.retryTimeout = setTimeout(this.sendConnectMessage.bind(this), 250);
    }

    /**
     *
     * @param {Error | string} err
     * @param {string} address
     * @returns
     */
    hostResolve(err, address) {
        if (err) {
            console.log(err);
            this.emit('error', err);
            return;
        }

        this.address = address[0];
        this.makePrefix();
        this.sendConnectMessage();
    }

    makePrefix() {
        const octets = this.address.split('.');
        const address = String.fromCharCode.apply(null, octets);
        const port = String.fromCharCode(this.port & 0xff, this.port >>> 8);
        let pwlen = this.password.length;

        pwlen = String.fromCharCode(pwlen & 0xff, pwlen >>> 8);

        this.prefix = `SAMP${address}${port}x${pwlen}${this.password}`;
        this.responsePrefix = `SAMP${address}${port}x`;
    }

    /**
     *
     * @param {string} command
     */
    send(command) {
        let cmdlen = command.length;

        cmdlen = String.fromCharCode(cmdlen & 0xff, cmdlen >>> 8);

        const message = new Buffer.from(
            `${this.prefix}${cmdlen}${command}`,
            'binary'
        );

        this.socket.send(
            message,
            0,
            message.length,
            this.port,
            this.addressOverride || this.address
        );

        if (command === 'exit') {
            setTimeout(() => this.emit('close'), 1);
        }
    }

    close() {
        if (this.socket) {
            this.socket.close();
        }
        this.socket = null;

        if (this.retryTimeout !== null) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }

        this.emit('close');
    }

    /**
     *
     * @param {Buffer} message
     */
    onMessage(message) {
        if (message.toString('binary', 0, 11) === this.responsePrefix) {
            const len = message.readUint16LE(11);

            message = message.toString('binary', 13);

            if (message.length !== len) {
                console.warn(
                    `(node-rcon) Length mismatch (expected ${len}, got ${
                        message.length
                    }): ${JSON.stringify(message)}`
                );
            } else if (!this.ready) {
                if (message === 'Invalid RCON password.') {
                    this.emit('error', 'Invalid RCON password.');
                    this.close();
                } else if (message === this.connectMessage) {
                    this.ready = true;
                    this.emit('ready');
                }
            } else {
                if (message !== this.connectMessage) {
                    this.emit('message', message);
                }
            }
        }
    }
}
