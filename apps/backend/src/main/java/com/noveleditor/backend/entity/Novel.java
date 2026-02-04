package com.noveleditor.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Entity
@Table(name = "Novel")
public class Novel extends BaseEntity {
    private String userId;
    private String title;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String description;

    private String coverUrl;

    @Column(nullable = false, columnDefinition = "INTEGER DEFAULT 0")
    private Integer wordCount = 0;

    @Column(nullable = false, columnDefinition = "TEXT DEFAULT '{}'")
    private String formatting = "{}";
}
