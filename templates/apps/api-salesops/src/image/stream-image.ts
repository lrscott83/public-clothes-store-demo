import { NotFoundException, StreamableFile } from '@nestjs/common';
import { assertImageRef, type IImageStore } from '@store-mgmt/domain';
import type { Response } from 'express';
import { Readable } from 'node:stream';

/**
 * design.md D5 — the ADMIN read path, shared by the product and category
 * controllers.
 *
 * Deliberately NOT the public one: `api-public`'s image controller refuses to
 * serve an inactive row's image, and the admin list shows soft-deleted rows on
 * purpose, so reusing it would render broken exactly the rows an operator is
 * trying to inspect or restore. There is no content-derived cache key here
 * either — an operator who just replaced an image must see the new bytes on the
 * next paint, which is the opposite of the public path's immutability.
 *
 * Bytes are streamed, never buffered. Every rejection is a 404: absent ref,
 * malformed ref, and missing file are indistinguishable to the caller.
 */
export async function streamImage(
  store: IImageStore,
  companyId: string,
  ref: string | null | undefined,
  res: Response,
): Promise<StreamableFile> {
  if (typeof ref !== 'string') {
    throw new NotFoundException('Not Found');
  }

  try {
    assertImageRef(ref);
  } catch {
    throw new NotFoundException('Not Found');
  }

  const content = await store.open(companyId, ref);
  if (!content) {
    throw new NotFoundException('Not Found');
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200);

  return new StreamableFile(Readable.from(content.stream), {
    type: content.contentType,
    length: content.byteLength,
  });
}
