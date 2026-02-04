package com.noveleditor.backend.service;

import com.noveleditor.backend.dto.SyncDto;
import com.noveleditor.backend.entity.Chapter;
import com.noveleditor.backend.entity.Novel;
import com.noveleditor.backend.entity.Volume;
import com.noveleditor.backend.repository.ChapterRepository;
import com.noveleditor.backend.repository.NovelRepository;
import com.noveleditor.backend.repository.VolumeRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Root;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SyncService {

    private final NovelRepository novelRepository;
    private final VolumeRepository volumeRepository;
    private final ChapterRepository chapterRepository;

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional
    public SyncDto.PushResponse handlePush(SyncDto.PushRequest request) {
        SyncDto.Changes changes = request.getChanges();
        int count = 0;

        if (changes.getNovels() != null && !changes.getNovels().isEmpty()) {
            novelRepository.saveAll(changes.getNovels());
            count += changes.getNovels().size();
        }
        if (changes.getVolumes() != null && !changes.getVolumes().isEmpty()) {
            volumeRepository.saveAll(changes.getVolumes());
            count += changes.getVolumes().size();
        }
        if (changes.getChapters() != null && !changes.getChapters().isEmpty()) {
            chapterRepository.saveAll(changes.getChapters());
            count += changes.getChapters().size();
        }

        SyncDto.PushResponse response = new SyncDto.PushResponse();
        response.setSuccess(true);
        response.setProcessedCount(count);
        return response;
    }

    public SyncDto.PullResponse handlePull(SyncDto.PullRequest request) {
        long cursor = request.getLastSyncCursor() != null ? request.getLastSyncCursor() : 0;
        LocalDateTime since = LocalDateTime.ofInstant(Instant.ofEpochMilli(cursor), ZoneId.systemDefault());

        SyncDto.Changes data = new SyncDto.Changes();

        data.setNovels(findUpdated(Novel.class, since));
        data.setVolumes(findUpdated(Volume.class, since));
        data.setChapters(findUpdated(Chapter.class, since));

        SyncDto.PullResponse response = new SyncDto.PullResponse();
        response.setNewSyncCursor(System.currentTimeMillis());
        response.setData(data);
        return response;
    }

    private <T> List<T> findUpdated(Class<T> entityClass, LocalDateTime since) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<T> query = cb.createQuery(entityClass);
        Root<T> root = query.from(entityClass);
        query.select(root).where(cb.greaterThanOrEqualTo(root.get("updatedAt"), since));
        return entityManager.createQuery(query).getResultList();
    }
}
