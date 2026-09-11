import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Post,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import type { MasterDataImportResult } from "@blackbox/shared";
import type { Response } from "express";
import { memoryStorage, MulterError } from "multer";
import { MasterDataImportService } from "./master-data-import.service";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_FILES = 1;

@Catch(MulterError)
class MasterDataUploadExceptionFilter implements ExceptionFilter {
  catch(error: MulterError, host: ArgumentsHost): void {
    const message = this.messageFor(error);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(422)
      .json({
        message: "Master-data import validation failed",
        errors: [
          {
            file: "archive",
            line: null,
            column: null,
            message,
          },
        ],
      });
  }

  private messageFor(error: MulterError): string {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return "Each uploaded file must not exceed 10 MB";
      case "LIMIT_FILE_COUNT":
        return "Upload exactly one master-data CSV file";
      case "LIMIT_UNEXPECTED_FILE":
        return "Upload exactly one master-data CSV file";
      default:
        return error.message;
    }
  }
}

@Controller("inventory-imports")
@UseFilters(MasterDataUploadExceptionFilter)
export class MasterDataImportController {
  constructor(private readonly service: MasterDataImportService) {}

  @Post("master-data")
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_UPLOAD_FILES },
    }),
  )
  importMasterData(
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<MasterDataImportResult> {
    return this.service.import(files);
  }
}
