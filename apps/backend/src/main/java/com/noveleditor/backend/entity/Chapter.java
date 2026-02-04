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
@Table(name = "Chapter")
public class Chapter extends BaseEntity {
    private String volumeId;
    private String title;

    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String content;

    private Integer wordCount;
    private Integer orderIndex;
}
