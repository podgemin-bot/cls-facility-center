-- CreateTable
CREATE TABLE `CodeSequence` (
    `prefix` VARCHAR(20) NOT NULL,
    `lastValue` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`prefix`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the CUST counter from the highest customer code already in use so the
-- next issued code cannot collide with an existing one.
INSERT INTO `CodeSequence` (`prefix`, `lastValue`, `updatedAt`)
SELECT 'CUST', COALESCE(MAX(CAST(SUBSTRING(`code`, 6) AS UNSIGNED)), 0), CURRENT_TIMESTAMP(3)
FROM `Customer`
WHERE `code` REGEXP '^CUST-[0-9]+$';
