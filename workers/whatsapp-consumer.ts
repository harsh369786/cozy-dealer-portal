import { getDatabase } from "../api/db/get-db";
import { processWhatsappOutbox } from "../api/services/whatsapp";
import type { ApiEnv } from "../api/types";

export async function handleQueueBatch(
  batch: MessageBatch<{ outboxId: string }>,
  env: ApiEnv,
) {
  const db = await getDatabase(env);
  for (const msg of batch.messages) {
    await processWhatsappOutbox(db, msg.body.outboxId);
    msg.ack();
  }
}
