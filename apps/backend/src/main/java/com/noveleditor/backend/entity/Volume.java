package com.noveleditor.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Entity
@Table(name = "Volume")
public class Volume extends BaseEntity {
    private String novelId;
    private String title;
    private Integer orderIndex;
}
