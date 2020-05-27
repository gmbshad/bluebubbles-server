/* eslint-disable no-param-reassign */
import { createConnection, Connection } from "typeorm";

import { convertDateTo2001Time } from "@server/api/imessage/helpers/dateUtil";
import { Chat } from "@server/api/imessage/entity/Chat";
import { Handle } from "@server/api/imessage/entity/Handle";
import { Message } from "@server/api/imessage/entity/Message";
import { Attachment } from "./entity/Attachment";

/**
 * A repository class to facilitate pulling information from the iMessage database
 */
export class DatabaseRepository {
    db: Connection = null;

    constructor() {
        this.db = null;
    }

    /**
     * Creates a connection to the iMessage database
     */
    async initialize() {
        this.db = await createConnection({
            name: "iMessage",
            type: "sqlite",
            database: `${process.env.HOME}/Library/Messages/chat.db`,
            entities: [Chat, Handle, Message, Attachment],
            synchronize: false,
            logging: false
        });

        return this.db;
    }

    /**
     * Get all the chats from the DB
     *
     * @param identifier A specific chat identifier to get
     * @param withParticipants Whether to include the participants or not
     */
    async getChats(chatGuid?: string, withParticipants = true) {
        const query = this.db.getRepository(Chat).createQueryBuilder("chat");

        // Inner-join because a chat must have participants
        if (withParticipants)
            query.innerJoinAndSelect("chat.participants", "handle");

        // Add default WHERE clauses
        query.andWhere("chat.service_name == 'iMessage'");
        if (chatGuid) query.andWhere("chat.guid == :guid", { guid: chatGuid });

        const chats = await query.getMany();
        return chats;
    }

    /**
     * Get all the chats from the DB
     *
     * @param attachmentGuid A specific attachment identifier to get
     * @param withMessages Whether to include the participants or not
     */
    async getAttachment(attachmentGuid: string, withMessages = false) {
        const query = this.db
            .getRepository(Attachment)
            .createQueryBuilder("attachment");

        if (withMessages)
            query.leftJoinAndSelect("attachment.messages", "message");

        query.andWhere("attachment.guid == :guid", { guid: attachmentGuid });

        const attachment = await query.getOne();
        return attachment;
    }

    /**
     * Get all the handles from the DB
     *
     * @param handle Get a specific handle from the DB
     */
    async getHandles(handle: string = null) {
        const repo = this.db.getRepository(Handle);
        let handles = [];

        // Get all handles or just get one handle
        if (handle) {
            handles = await repo.find({ id: handle });
        } else {
            handles = await repo.find();
        }

        return handles;
    }

    /**
     * Gets all messages associated with a chat
     *
     * @param chat The chat to get the messages from
     * @param offset The offset to start getting the messages from
     * @param limit The max number of messages to return
     * @param after The earliest date to get messages from
     * @param before The latest date to get messages from
     */
    async getMessages(
        chatGuid: string,
        offset = 0,
        limit = 100,
        after?: Date,
        before?: Date,
        withChats = false
    ) {
        // Get messages with sender and the chat it's from
        const query = this.db
            .getRepository(Message)
            .createQueryBuilder("message")
            .leftJoinAndSelect("message.handle", "handle")
            .leftJoinAndSelect(
                "message.attachments",
                "attachment",
                (
                    "message.ROWID == message_attachment.message_id AND " +
                    "attachment.ROWID == message_attachment.attachment_id"
                )
            );

        // Inner-join because all messages will have a chat
        if (chatGuid) {
            query.innerJoinAndSelect(
                "message.chats",
                "chat",
                "message.ROWID == message_chat.message_id AND chat.ROWID == message_chat.chat_id"
            )
            .andWhere("chat.guid = :guid", { guid: chatGuid });
        } else if (withChats) {
            query.innerJoinAndSelect(
                "message.chats",
                "chat",
                "message.ROWID == message_chat.message_id AND chat.ROWID == message_chat.chat_id"
            );
        }

        // Add default WHERE clauses
        query
            .andWhere("message.service == 'iMessage'")
            .andWhere("message.text IS NOT NULL");

        // Add date restraints
        if (after)
            query.andWhere("message.date >= :after", {
                after: convertDateTo2001Time(after)
            });
        if (before)
            query.andWhere("message.date < :before", {
                before: convertDateTo2001Time(before)
            });

        // Add pagination params
        query.orderBy("message.date", "DESC");
        query.offset(offset);
        query.limit(limit);

        const messages = await query.getMany();
        return messages;
    }

    /**
     * Gets all messages that have been updated
     *
     * @param chat The chat to get the messages from
     * @param offset The offset to start getting the messages from
     * @param limit The max number of messages to return
     * @param after The earliest date to get messages from
     * @param before The latest date to get messages from
     */
    async getUpdatedMessages(
        chatGuid: string,
        offset = 0,
        limit = 100,
        after?: Date,
        before?: Date,
        withChats = false
    ) {
        // Get messages with sender and the chat it's from
        const query = this.db
            .getRepository(Message)
            .createQueryBuilder("message")
            .leftJoinAndSelect("message.handle", "handle");

        // Inner-join because all messages will have a chat
        if (chatGuid) {
            query
                .innerJoinAndSelect(
                    "message.chats",
                    "chat",
                    "message.ROWID == message_chat.message_id AND chat.ROWID == message_chat.chat_id"
                )
                .andWhere("chat.guid = :guid", { guid: chatGuid });
        } else if (withChats) {
            query.innerJoinAndSelect(
                "message.chats",
                "chat",
                "message.ROWID == message_chat.message_id AND chat.ROWID == message_chat.chat_id"
            );
        }

        // Add default WHERE clauses
        query.andWhere("message.service == 'iMessage'");

        // Add date_delivered constraints
        if (after)
            query.andWhere("message.date_delivered >= :after", {
                after: convertDateTo2001Time(after)
            });
        if (before)
            query.andWhere("message.date_delivered < :before", {
                before: convertDateTo2001Time(before)
            });

        // Add date_read constraints
        if (after)
            query.orWhere("message.date_read >= :after", {
                after: convertDateTo2001Time(after)
            });
        if (before)
            query.andWhere("message.date_read < :before", {
                before: convertDateTo2001Time(before)
            });

        // Add pagination params
        query.orderBy("message.date", "DESC");
        query.offset(offset);
        query.limit(limit);

        const messages = await query.getMany();
        return messages;
    }

    /**
     * Gets message counts associated with a chat
     *
     * @param after The earliest date to get messages from
     * @param before The latest date to get messages from
     */
    async getMessageCount(after?: Date, before?: Date, isFromMe = false) {
        // Get messages with sender and the chat it's from
        const query = this.db
            .getRepository(Message)
            .createQueryBuilder("message");

        // Add default WHERE clauses
        query
            .andWhere("message.service == 'iMessage'")
            .andWhere("message.text IS NOT NULL")
            .andWhere("associated_message_type == 0");

        if (isFromMe) query.andWhere("message.is_from_me = 1");

        // Add date restraints
        if (after)
            query.andWhere("message.date >= :after", {
                after: convertDateTo2001Time(after)
            });
        if (before)
            query.andWhere("message.date < :before", {
                before: convertDateTo2001Time(before)
            });

        // Add pagination params
        query.orderBy("message.date", "DESC");

        const count = await query.getCount();
        return count;
    }

    /**
     * Count messages associated with different chats
     *
     * @param chatStyle Whether you are fetching the count for a group or individual chat
     */
    async getChatMessageCounts(chatStyle: "group" | "individual") {
        // Get messages with sender and the chat it's from
        const result = await this.db.getRepository(Chat).query(
            `SELECT
                chat.chat_identifier AS chat_identifier,
                chat.display_name AS group_name,
                COUNT(message.ROWID) AS message_count
            FROM chat
            JOIN chat_message_join AS cmj ON chat.ROWID = cmj.chat_id
            JOIN message ON message.ROWID = cmj.message_id
            WHERE chat.style = ?
            GROUP BY chat.guid;`,
            [chatStyle === "group" ? 43 : 45]
        );

        return result;
    }

    /**
     * Count messages associated with different chats
     *
     * @param chatStyle Whether you are fetching the count for a group or individual chat
     */
    async getChatImageCounts() {
        // Get messages with sender and the chat it's from
        const result = await this.db.getRepository(Chat).query(
            `SELECT
                chat.chat_identifier AS chat_identifier,
                chat.display_name AS group_name,
                COUNT(attachment.ROWID) AS image_count
            FROM chat
            JOIN chat_message_join AS cmj ON chat.ROWID = cmj.chat_id
            JOIN message ON message.ROWID = cmj.message_id
            JOIN message_attachment_join AS maj ON message.ROWID = maj.message_id
            JOIN attachment ON attachment.ROWID = maj.attachment_id
            WHERE attachment.mime_type LIKE 'image%'
            GROUP BY chat.guid;`
        );

        return result;
    }

    /**
     * Gets message counts associated with a chat
     *
     * @param after The earliest date to get messages from
     * @param before The latest date to get messages from
     */
    async getAttachmentCount() {
        // Get messages with sender and the chat it's from
        const query = this.db
            .getRepository(Attachment)
            .createQueryBuilder("attachment");

        const count = await query.getCount();
        return count;
    }
}
