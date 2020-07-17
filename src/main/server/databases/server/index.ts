import { app } from "electron";
import { createConnection, Connection } from "typeorm";
import { ServerSingleton } from "@server/index";
import { Config, Alert, Device, Queue } from "./entity";
import { DEFAULT_DB_ITEMS } from "./constants";

export class ServerRepository {
    db: Connection = null;

    config: { [key: string]: any };

    constructor() {
        this.db = null;
        this.config = {};
    }

    async initialize(): Promise<Connection> {
        const isDev = process.env.NODE_ENV !== "production";
        if (this.db) {
            if (!this.db.isConnected) await this.db.connect();
            return this.db;
        }

        let dbPath = `${app.getPath("userData")}/config.db`;
        if (isDev) {
            dbPath = `${app.getPath("userData")}/bluebubbles-server/config.db`;
        }

        this.db = await createConnection({
            name: "config",
            type: "sqlite",
            database: dbPath,
            entities: [Config, Alert, Device, Queue],
            synchronize: isDev,
            logging: false
        });

        // Create the tables
        if (!isDev) await this.db.synchronize();

        // Load default config items
        await this.loadConfig();
        await this.setupDefaults();
        return this.db;
    }

    /**
     * Get the device repo
     */
    devices() {
        return this.db.getRepository(Device);
    }

    /**
     * Get the alert repo
     */
    alerts() {
        return this.db.getRepository(Alert);
    }

    /**
     * Get the device repo
     */
    queue() {
        return this.db.getRepository(Queue);
    }

    /**
     * Get the device repo
     */
    configs() {
        return this.db.getRepository(Config);
    }

    private async loadConfig() {
        const items: Config[] = await this.configs().find();
        for (const i of items) this.config[i.name] = ServerRepository.convertFromDbValue(i.value);
    }

    /**
     * Checks if the config has an item
     *
     * @param name The name of the item to check for
     */
    hasConfig(name: string): boolean {
        return Object.keys(this.config).includes(name);
    }

    /**
     * Retrieves a config item from the cache
     *
     * @param name The name of the config item
     */
    getConfig(name: string): Date | string | boolean | number {
        if (!Object.keys(this.config).includes(name)) return null;
        return ServerRepository.convertFromDbValue(this.config[name]);
    }

    /**
     * Sets a config item in the database
     *
     * @param name The name of the config item
     * @param value The value for the config item
     */
    async setConfig(name: string, value: Date | string | boolean | number): Promise<void> {
        const saniVal = ServerRepository.convertToDbValue(value);
        const item = await this.configs().findOne({ name });

        // Either change or create the new Config object
        if (item) {
            await this.configs().update(item, { value: saniVal });
        } else {
            const cfg = this.configs().create({ name, value: saniVal });
            await this.configs().save(cfg);
        }

        this.config[name] = saniVal;
        ServerSingleton().emitToUI("config-update", this.config);
    }

    /**
     * This sets any default database values, if the database
     * has not already been initialized
     */
    private async setupDefaults(): Promise<void> {
        try {
            for (const key of Object.keys(DEFAULT_DB_ITEMS)) {
                const item = await this.hasConfig(key);
                if (!item) await this.setConfig(key, DEFAULT_DB_ITEMS[key]());
            }
        } catch (ex) {
            ServerSingleton().log(`Failed to setup default configurations! ${ex.message}`, "error");
        }
    }

    /**
     * Converts a generic string value from the database
     * to its' corresponding correct typed value
     *
     * @param input The value straight from the database
     */
    private static convertFromDbValue(input: string): any {
        if (input === "1" || input === "0") return Boolean(Number(input));
        if (/^-{0,1}\d+$/.test(input)) return Number(input);
        return input;
    }

    /**
     * Converts a typed database value input to a string.
     *
     * @param input The typed database value
     */
    private static convertToDbValue(input: any): string {
        if (typeof input === "boolean") return input ? "1" : "0";
        if (input instanceof Date) return String(input.getTime());
        return String(input);
    }
}
