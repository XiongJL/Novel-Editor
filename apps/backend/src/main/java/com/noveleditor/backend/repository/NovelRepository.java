package com.noveleditor.backend.repository;

import com.noveleditor.backend.entity.Novel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NovelRepository extends JpaRepository<Novel, String> {
    List<Novel> findByUserId(String userId);
}
