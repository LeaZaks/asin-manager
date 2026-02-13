import { ImportSource } from "@prisma/client";
import { prisma } from "../lib/prisma";

export interface CreateImportFileData {
  file_name: string;
  source: ImportSource;
  file?: Buffer;
  total_rows: number;
}

export interface UpdateImportSummaryData {
  inserted_rows: number;
  updated_rows: number;
  failed_rows: number;
  error_file_path?: string;
}

export const importRepository = {
  async create(data: CreateImportFileData) {
    return prisma.importFile.create({
      data: {
        file_name: data.file_name,
        source: data.source,
        file: data.file,
        total_rows: data.total_rows,
      },
    });
  },

  async updateSummary(id: number, summary: UpdateImportSummaryData) {
    return prisma.importFile.update({
      where: { id },
      data: summary,
    });
  },

  async findMany() {
    return prisma.importFile.findMany({
      orderBy: { uploaded_at: "desc" },
      select: {
        id: true,
        file_name: true,
        source: true,
        uploaded_at: true,
        total_rows: true,
        inserted_rows: true,
        updated_rows: true,
        failed_rows: true,
        error_file_path: true,
        // Exclude the binary `file` field from list view
      },
    });
  },
};
