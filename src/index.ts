import { isFullPage, Client as NotionClient } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import ical from "ical-generator";

dayjs.extend(utc);

interface Env {
  ACCESS_TOKEN: string;
  NOTION_SECRET: string;
  NOTION_CALENDAR_ID: string;
  CALENDAR_NAME: string;
  EVENT_PROPERTY_TITLE: string;
  EVENT_PROPERTY_CATEGORY: string;
  EVENT_PROPERTY_DATETIME: string;
  EVENT_PROPERTY_LOCATION: string;
  CATEGORY_FALLBACK_TEXT: string;
}

type SelectProperty = Extract<
  PageObjectResponse["properties"][string],
  { type: "select" }
>;
type TitleProperty = Extract<
  PageObjectResponse["properties"][string],
  { type: "title" }
>;
type DateProperty = Extract<
  PageObjectResponse["properties"][string],
  { type: "date" }
>;
type RichTextProperty = Extract<
  PageObjectResponse["properties"][string],
  { type: "rich_text" }
>;

export default {
  async fetch(request, env: Env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const accessToken = url.searchParams.get("token") ?? "";

    const encoder = new TextEncoder();

    const givenToken = encoder.encode(accessToken);
    const actualToken = encoder.encode(env.ACCESS_TOKEN);

    if (
      givenToken.length !== actualToken.length ||
      !crypto.subtle.timingSafeEqual(givenToken, actualToken)
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    const notion = new NotionClient({ auth: env.NOTION_SECRET });

    const events = await notion.databases.query({
      database_id: env.NOTION_CALENDAR_ID,
    });

    const calendar = ical({ name: env.CALENDAR_NAME });

    for (const event of events.results) {
      if (!isFullPage(event)) continue;

      const propertyCategory = event.properties[
        env.EVENT_PROPERTY_CATEGORY
      ] as SelectProperty;
      const propertyTitle = event.properties[
        env.EVENT_PROPERTY_TITLE
      ] as TitleProperty;
      const propertyDatetime = event.properties[
        env.EVENT_PROPERTY_DATETIME
      ] as DateProperty;
      const propertyLocation = event.properties[
        env.EVENT_PROPERTY_LOCATION
      ] as RichTextProperty;

      if (propertyDatetime.date == null) continue;

      const summary =
        `[${propertyCategory.select?.name ?? env.CATEGORY_FALLBACK_TEXT}] ${propertyTitle.title[0].plain_text}` as string;
      const start = dayjs.utc(propertyDatetime.date.start);
      const allDay = propertyDatetime.date.start.length === 10;
      const end = (() => {
				const end = propertyDatetime.date.end ? dayjs.utc(propertyDatetime.date.end) : start;

				return allDay ? end.add(1, "day") : end;
      })();
      const location = propertyLocation.rich_text[0]?.plain_text;
      const url = event.url as string;

      calendar.createEvent({ summary, start, end, allDay, location, url });
    }

    return new Response(calendar.toString(), {
      headers: {
        "Content-Type": "text/calendar",
        "Content-Disposition": `attachment; filename="notionical.ics"`,
      },
    });
  },
} satisfies ExportedHandler<Env>;
