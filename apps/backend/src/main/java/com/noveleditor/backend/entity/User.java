package com.noveleditor.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@Entity
@Table(name = "User")
public class User extends BaseEntity {
    private String username;
    private String passwordHash;
    private String nickname;
    private String avatarUrl;
    private LocalDateTime lastSyncAt;
}
