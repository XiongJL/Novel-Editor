package com.noveleditor.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Entity
@Table(name = "Idea")
public class Idea extends BaseEntity {

    @Column(name = "novel_id", length = 64, nullable = false)
    private String novelId;

    @Column(name = "chapter_id", length = 64)
    private String chapterId;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(columnDefinition = "TEXT")
    private String quote;

    @Column(columnDefinition = "TEXT")
    private String cursor;

    @Column(name = "is_starred")
    private Boolean isStarred = false;

    @Column(name = "created_at", updatable = false)
    private java.time.LocalDateTime createdAt;

    @PrePersist
    @Override
    public void prePersist() {
        super.prePersist();
        if (this.createdAt == null) {
            this.createdAt = java.time.LocalDateTime.now();
        }
    }
}
