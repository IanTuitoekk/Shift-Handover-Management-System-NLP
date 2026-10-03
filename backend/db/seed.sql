WITH new_taxonomy AS (
    INSERT INTO incident_taxonomy (version) VALUES (1)
    RETURNING taxonomy_id
)
INSERT INTO incident_categories (taxonomy_id, category_name)
SELECT taxonomy_id, category_name
FROM new_taxonomy, (
    VALUES
        ('Aircraft Equipment Problem'),
        ('Deviation/Discrepancy - Procedural'),
        ('Other/Rare Ground Event')
) AS cats(category_name);