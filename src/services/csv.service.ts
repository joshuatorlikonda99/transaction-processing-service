import { createReadStream } from 'node:fs';
import csvParser from 'csv-parser';
import { ValidationError } from '../core/appError';
import { CsvRow } from '../middleware/validateCsvRow';

export class CsvService {
  async parse(
    filePath: string,
    onRow: (row: CsvRow) => Promise<void> | void,
  ): Promise<void> {
    const parser = createReadStream(filePath).pipe(
      csvParser({
        mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').trim(),
        mapValues: ({ value }) =>
          typeof value === 'string' ? value.trim() : value,
        skipLines: 0,
      }),
    );

    try {
      for await (const record of parser) {
        const row = record as CsvRow;
        const values = Object.values(row);
        if (values.length === 0 || values.every((value) => !value)) {
          continue;
        }
        await onRow(row);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to parse CSV';
      throw new ValidationError(message, undefined, 'INVALID_CSV');
    }
  }
}
