package com.noveleditor.backend.dto;

import com.noveleditor.backend.entity.Chapter;
import com.noveleditor.backend.entity.Novel;
import com.noveleditor.backend.entity.Volume;
import lombok.Data;

import java.util.List;

public class SyncDto {

    @Data
    public static class PushRequest {
        private Long lastSyncCursor;
        private Changes changes;
    }

    @Data
    public static class Changes {
        private List<Novel> novels;
        private List<Volume> volumes;
        private List<Chapter> chapters;
        // Add other entities here
    }

    @Data
    public static class PushResponse {
        private boolean success;
        private int processedCount;
    }

    @Data
    public static class PullRequest {
        private Long lastSyncCursor;
    }

    @Data
    public static class PullResponse {
        private Long newSyncCursor;
        private Changes data;
    }
}
