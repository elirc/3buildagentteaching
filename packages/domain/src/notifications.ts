import type { NotificationChannel, NotificationStatus } from "@agentic-edu/shared";

export interface NotificationDeliveryInput {
  channel: NotificationChannel;
  hasRecipient: boolean;
  status: NotificationStatus;
}

export interface NotificationDeliveryDecision {
  deliverable: boolean;
  reason?: string;
}

export function canDeliverNotification(input: NotificationDeliveryInput): NotificationDeliveryDecision {
  if (!input.hasRecipient) {
    return { deliverable: false, reason: "Notification requires a user or student recipient." };
  }

  if (input.status === "Read" || input.status === "Delivered") {
    return { deliverable: false, reason: "Notification was already delivered." };
  }

  if (input.channel === "Email" || input.channel === "Digest") {
    return { deliverable: true };
  }

  return { deliverable: true };
}

export function nextNotificationStatusAfterRead(status: NotificationStatus): NotificationStatus {
  return status === "Failed" ? "Failed" : "Read";
}
