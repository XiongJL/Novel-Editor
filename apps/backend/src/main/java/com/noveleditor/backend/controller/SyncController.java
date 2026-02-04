package com.noveleditor.backend.controller;

import com.noveleditor.backend.dto.SyncDto;
import com.noveleditor.backend.service.SyncService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sync")
@RequiredArgsConstructor
public class SyncController {

    private final SyncService syncService;

    @PostMapping("/push")
    public SyncDto.PushResponse push(@RequestBody SyncDto.PushRequest request) {
        return syncService.handlePush(request);
    }

    @PostMapping("/pull")
    public SyncDto.PullResponse pull(@RequestBody SyncDto.PullRequest request) {
        return syncService.handlePull(request);
    }
}
