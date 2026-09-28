-- CreateTable
CREATE TABLE `Customer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `stage` VARCHAR(20) NOT NULL DEFAULT 'INQUIRY',
    `contactName` VARCHAR(120) NOT NULL,
    `contactPhone` VARCHAR(30) NOT NULL,
    `contactEmail` VARCHAR(120) NULL,
    `interestedRooms` JSON NULL,
    `inquiryDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `contractNo` VARCHAR(60) NULL,
    `contractStart` DATETIME(3) NULL,
    `contractEnd` DATETIME(3) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
