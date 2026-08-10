import { z } from "zod";

const summaryField = z.string().trim().min(1);

export const fiveWOneHSchema = z.object({
  who: summaryField,
  what: summaryField,
  when: summaryField,
  where: summaryField,
  why: summaryField,
  how: summaryField,
}).strict();
