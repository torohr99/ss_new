-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "profile_pic" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "otpCode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "predictions_total" INTEGER NOT NULL DEFAULT 0,
    "predictions_won" INTEGER NOT NULL DEFAULT 0,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "badge_name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "friend_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" SERIAL NOT NULL,
    "blockerId" INTEGER NOT NULL,
    "blockedId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" INTEGER,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "logo_url" TEXT NOT NULL,
    "sport" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTeam" (
    "user_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,

    CONSTRAINT "UserTeam_pkey" PRIMARY KEY ("user_id","team_id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Like" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "post_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,
    "post_id" INTEGER NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMessage" (
    "id" SERIAL NOT NULL,
    "gameId" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "poll_question" TEXT,
    "poll_options" TEXT,
    "poll_results" TEXT,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyLeague" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREDRAFT',
    "currentPickIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyLeague_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTeam" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "draftOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "faab" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "FantasyTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyPlayer" (
    "id" SERIAL NOT NULL,
    "espnId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "jerseyNumber" TEXT,
    "imageUrl" TEXT,
    "byeWeek" INTEGER,
    "projectedPoints" DOUBLE PRECISION,
    "lastYearPoints" DOUBLE PRECISION,

    CONSTRAINT "FantasyPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyDraftPick" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "pickNumber" INTEGER NOT NULL,

    CONSTRAINT "FantasyDraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTeamPlayer" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BENCH',

    CONSTRAINT "FantasyTeamPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyWeeklyScore" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isLive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FantasyWeeklyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyPlayerWeeklyScore" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isLive" BOOLEAN NOT NULL DEFAULT true,
    "statsJson" TEXT,

    CONSTRAINT "FantasyPlayerWeeklyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BracketLeague" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "passcode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BracketLeague_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BracketPick" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "bracketData" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BracketPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyMatchup" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "homeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "awayScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',

    CONSTRAINT "FantasyMatchup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTransaction" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "playerId" INTEGER,
    "relatedTeamId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyWaiverClaim" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "bidAmount" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyWaiverClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTrade" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "proposerTeamId" INTEGER NOT NULL,
    "recipientTeamId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "FantasyTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTradeItem" (
    "id" SERIAL NOT NULL,
    "tradeId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "fromTeamId" INTEGER NOT NULL,
    "toTeamId" INTEGER NOT NULL,

    CONSTRAINT "FantasyTradeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Notification_user_id_read_created_at_idx" ON "Notification"("user_id", "read", "created_at");

-- CreateIndex
CREATE INDEX "UserBadge_user_id_created_at_idx" ON "UserBadge"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "UserBadge_user_id_badge_name_idx" ON "UserBadge"("user_id", "badge_name");

-- CreateIndex
CREATE INDEX "Friendship_friend_id_status_idx" ON "Friendship"("friend_id", "status");

-- CreateIndex
CREATE INDEX "Friendship_user_id_status_idx" ON "Friendship"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_user_id_friend_id_key" ON "Friendship"("user_id", "friend_id");

-- CreateIndex
CREATE INDEX "Block_blockerId_idx" ON "Block"("blockerId");

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_blockerId_blockedId_key" ON "Block"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_reporterId_createdAt_idx" ON "Report"("reporterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Team_sport_abbreviation_key" ON "Team"("sport", "abbreviation");

-- CreateIndex
CREATE INDEX "Post_user_id_idx" ON "Post"("user_id");

-- CreateIndex
CREATE INDEX "Post_created_at_idx" ON "Post"("created_at");

-- CreateIndex
CREATE INDEX "Like_post_id_idx" ON "Like"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "Like_user_id_post_id_key" ON "Like"("user_id", "post_id");

-- CreateIndex
CREATE INDEX "Comment_post_id_created_at_idx" ON "Comment"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "GameMessage_gameId_createdAt_idx" ON "GameMessage"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "GameMessage_league_gameId_createdAt_idx" ON "GameMessage"("league", "gameId", "createdAt");

-- CreateIndex
CREATE INDEX "FantasyLeague_ownerId_idx" ON "FantasyLeague"("ownerId");

-- CreateIndex
CREATE INDEX "FantasyLeague_status_createdAt_idx" ON "FantasyLeague"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FantasyTeam_leagueId_idx" ON "FantasyTeam"("leagueId");

-- CreateIndex
CREATE INDEX "FantasyTeam_userId_idx" ON "FantasyTeam"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyPlayer_espnId_key" ON "FantasyPlayer"("espnId");

-- CreateIndex
CREATE INDEX "FantasyPlayer_position_name_idx" ON "FantasyPlayer"("position", "name");

-- CreateIndex
CREATE INDEX "FantasyDraftPick_teamId_idx" ON "FantasyDraftPick"("teamId");

-- CreateIndex
CREATE INDEX "FantasyDraftPick_playerId_idx" ON "FantasyDraftPick"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyDraftPick_leagueId_playerId_key" ON "FantasyDraftPick"("leagueId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyDraftPick_leagueId_pickNumber_key" ON "FantasyDraftPick"("leagueId", "pickNumber");

-- CreateIndex
CREATE INDEX "FantasyTeamPlayer_teamId_status_idx" ON "FantasyTeamPlayer"("teamId", "status");

-- CreateIndex
CREATE INDEX "FantasyTeamPlayer_playerId_idx" ON "FantasyTeamPlayer"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyTeamPlayer_teamId_playerId_key" ON "FantasyTeamPlayer"("teamId", "playerId");

-- CreateIndex
CREATE INDEX "FantasyWeeklyScore_weekNumber_idx" ON "FantasyWeeklyScore"("weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyWeeklyScore_teamId_weekNumber_key" ON "FantasyWeeklyScore"("teamId", "weekNumber");

-- CreateIndex
CREATE INDEX "FantasyPlayerWeeklyScore_weekNumber_idx" ON "FantasyPlayerWeeklyScore"("weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyPlayerWeeklyScore_playerId_weekNumber_key" ON "FantasyPlayerWeeklyScore"("playerId", "weekNumber");

-- CreateIndex
CREATE INDEX "BracketPick_leagueId_idx" ON "BracketPick"("leagueId");

-- CreateIndex
CREATE INDEX "BracketPick_userId_idx" ON "BracketPick"("userId");

-- CreateIndex
CREATE INDEX "BracketPick_leagueId_userId_idx" ON "BracketPick"("leagueId", "userId");

-- CreateIndex
CREATE INDEX "FantasyMatchup_leagueId_weekNumber_idx" ON "FantasyMatchup"("leagueId", "weekNumber");

-- CreateIndex
CREATE INDEX "FantasyTransaction_leagueId_createdAt_idx" ON "FantasyTransaction"("leagueId", "createdAt");

-- CreateIndex
CREATE INDEX "FantasyTransaction_teamId_createdAt_idx" ON "FantasyTransaction"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "FantasyTransaction_playerId_idx" ON "FantasyTransaction"("playerId");

-- CreateIndex
CREATE INDEX "FantasyWaiverClaim_leagueId_status_idx" ON "FantasyWaiverClaim"("leagueId", "status");

-- CreateIndex
CREATE INDEX "FantasyWaiverClaim_teamId_idx" ON "FantasyWaiverClaim"("teamId");

-- CreateIndex
CREATE INDEX "FantasyWaiverClaim_playerId_idx" ON "FantasyWaiverClaim"("playerId");

-- CreateIndex
CREATE INDEX "FantasyTrade_leagueId_status_idx" ON "FantasyTrade"("leagueId", "status");

-- CreateIndex
CREATE INDEX "FantasyTrade_proposerTeamId_idx" ON "FantasyTrade"("proposerTeamId");

-- CreateIndex
CREATE INDEX "FantasyTrade_recipientTeamId_idx" ON "FantasyTrade"("recipientTeamId");

-- CreateIndex
CREATE INDEX "FantasyTradeItem_tradeId_idx" ON "FantasyTradeItem"("tradeId");

-- CreateIndex
CREATE INDEX "FantasyTradeItem_playerId_idx" ON "FantasyTradeItem"("playerId");

-- CreateIndex
CREATE INDEX "FantasyTradeItem_fromTeamId_idx" ON "FantasyTradeItem"("fromTeamId");

-- CreateIndex
CREATE INDEX "FantasyTradeItem_toTeamId_idx" ON "FantasyTradeItem"("toTeamId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMessage" ADD CONSTRAINT "GameMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyLeague" ADD CONSTRAINT "FantasyLeague_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "FantasyLeague"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyDraftPick" ADD CONSTRAINT "FantasyDraftPick_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "FantasyLeague"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyDraftPick" ADD CONSTRAINT "FantasyDraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "FantasyPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeamPlayer" ADD CONSTRAINT "FantasyTeamPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeamPlayer" ADD CONSTRAINT "FantasyTeamPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "FantasyPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyWeeklyScore" ADD CONSTRAINT "FantasyWeeklyScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyPlayerWeeklyScore" ADD CONSTRAINT "FantasyPlayerWeeklyScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "FantasyPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketLeague" ADD CONSTRAINT "BracketLeague_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketPick" ADD CONSTRAINT "BracketPick_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "BracketLeague"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketPick" ADD CONSTRAINT "BracketPick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyMatchup" ADD CONSTRAINT "FantasyMatchup_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "FantasyLeague"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyMatchup" ADD CONSTRAINT "FantasyMatchup_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyMatchup" ADD CONSTRAINT "FantasyMatchup_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTransaction" ADD CONSTRAINT "FantasyTransaction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "FantasyLeague"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTransaction" ADD CONSTRAINT "FantasyTransaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTransaction" ADD CONSTRAINT "FantasyTransaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "FantasyPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyWaiverClaim" ADD CONSTRAINT "FantasyWaiverClaim_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "FantasyLeague"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyWaiverClaim" ADD CONSTRAINT "FantasyWaiverClaim_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyWaiverClaim" ADD CONSTRAINT "FantasyWaiverClaim_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "FantasyPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTrade" ADD CONSTRAINT "FantasyTrade_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "FantasyLeague"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTrade" ADD CONSTRAINT "FantasyTrade_proposerTeamId_fkey" FOREIGN KEY ("proposerTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTrade" ADD CONSTRAINT "FantasyTrade_recipientTeamId_fkey" FOREIGN KEY ("recipientTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTradeItem" ADD CONSTRAINT "FantasyTradeItem_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "FantasyTrade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTradeItem" ADD CONSTRAINT "FantasyTradeItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "FantasyPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTradeItem" ADD CONSTRAINT "FantasyTradeItem_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTradeItem" ADD CONSTRAINT "FantasyTradeItem_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

