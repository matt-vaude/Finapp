-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_connectionId_fkey";

-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "connectionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
