package com.noveleditor.backend.repository;

import com.noveleditor.backend.entity.Volume;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VolumeRepository extends JpaRepository<Volume, String> {
    List<Volume> findByNovelId(String novelId);
}
