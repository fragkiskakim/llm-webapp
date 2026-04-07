#pragma once

#include <string>
#include <vector>
#include <memory>
#include <optional>
#include <cstdint>

namespace Data {

// Forward declarations (cross-namespace)
class BusinessCoordinateGroup;

// --------------------
// Data Transfer Objects
// --------------------
struct DataCoordinateGroupRecord final {
    int id{};
    std::string label;
    std::int64_t timestampEpochSeconds{};

    double x{};
    double y{};
    double r{};
    double thetaRadians{};
};

// --------------------
// Database Abstractions
// --------------------
class DataMySqlConnection final {
public:
    DataMySqlConnection(const std::string& host,
                        int port,
                        const std::string& database,
                        const std::string& user,
                        const std::string& password);
    ~DataMySqlConnection();

    DataMySqlConnection(const DataMySqlConnection&) = delete;
    DataMySqlConnection& operator=(const DataMySqlConnection&) = delete;

    DataMySqlConnection(DataMySqlConnection&&) noexcept;
    DataMySqlConnection& operator=(DataMySqlConnection&&) noexcept;

    bool isOpen() const;
    void open();
    void close();

private:
    std::string m_host;
    int m_port{};
    std::string m_database;
    std::string m_user;
    std::string m_password;
    bool m_open{false};
};

class DataCoordinateGroupRepository final {
public:
    explicit DataCoordinateGroupRepository(std::shared_ptr<DataMySqlConnection> connection);
    ~DataCoordinateGroupRepository();

    // Create
    int insert(const DataCoordinateGroupRecord& record);

    // Read
    std::optional<DataCoordinateGroupRecord> findById(int id) const;
    std::vector<DataCoordinateGroupRecord> findByLabel(const std::string& label) const;
    std::vector<DataCoordinateGroupRecord> findAll() const;

    // Update
    bool update(const DataCoordinateGroupRecord& record);

    // Delete
    bool removeById(int id);

private:
    std::shared_ptr<DataMySqlConnection> m_connection;
};

class DataCoordinateGroupMapper final {
public:
    DataCoordinateGroupMapper() = default;
    ~DataCoordinateGroupMapper() = default;

    DataCoordinateGroupRecord toRecord(const BusinessCoordinateGroup& group) const;
    BusinessCoordinateGroup toDomain(const DataCoordinateGroupRecord& record) const;
};

} // namespace Data

namespace Business {

// Forward declarations (cross-namespace)
class DataCoordinateGroupRepository;
class DataCoordinateGroupMapper;

// --------------------
// Domain Model
// --------------------
struct BusinessCartesianCoord final {
    double x{};
    double y{};
};

struct BusinessPolarCoord final {
    double r{};
    double thetaRadians{};
};

class BusinessCoordinateGroup final {
public:
    BusinessCoordinateGroup();
    BusinessCoordinateGroup(int id,
                            const std::string& label,
                            std::int64_t timestampEpochSeconds,
                            const BusinessCartesianCoord& cartesian,
                            const BusinessPolarCoord& polar);

    int getId() const;
    void setId(int id);

    const std::string& getLabel() const;
    void setLabel(const std::string& label);

    std::int64_t getTimestampEpochSeconds() const;
    void setTimestampEpochSeconds(std::int64_t ts);

    const BusinessCartesianCoord& getCartesian() const;
    void setCartesian(const BusinessCartesianCoord& cartesian);

    const BusinessPolarCoord& getPolar() const;
    void setPolar(const BusinessPolarCoord& polar);

private:
    int m_id{0};
    std::string m_label;
    std::int64_t m_timestampEpochSeconds{0};
    BusinessCartesianCoord m_cartesian{};
    BusinessPolarCoord m_polar{};
};

// --------------------
// Conversion Service
// --------------------
class BusinessCoordinateConverter final {
public:
    BusinessCoordinateConverter() = default;
    ~BusinessCoordinateConverter() = default;

    BusinessPolarCoord cartesianToPolar(const BusinessCartesianCoord& cart) const;
    BusinessCartesianCoord polarToCartesian(const BusinessPolarCoord& polar) const;
};

// --------------------
// Application Service (Use Cases)
// --------------------
class BusinessCoordinateGroupService final {
public:
    BusinessCoordinateGroupService(std::shared_ptr<DataCoordinateGroupRepository> repository,
                                   std::shared_ptr<DataCoordinateGroupMapper> mapper,
                                   std::shared_ptr<BusinessCoordinateConverter> converter);
    ~BusinessCoordinateGroupService();

    // Create: input either Cartesian or Polar; service computes the other.
    BusinessCoordinateGroup createFromCartesian(const std::string& label,
                                               const BusinessCartesianCoord& cartesian);
    BusinessCoordinateGroup createFromPolar(const std::string& label,
                                           const BusinessPolarCoord& polar);

    // Retrieve
    std::vector<BusinessCoordinateGroup> getAll() const;
    std::vector<BusinessCoordinateGroup> searchByLabel(const std::string& label) const;
    std::optional<BusinessCoordinateGroup> getById(int id) const;

    // Modify (updates label and/or coordinates; service keeps both representations consistent)
    bool updateFromCartesian(int id,
                             const std::string& newLabel,
                             const BusinessCartesianCoord& cartesian);
    bool updateFromPolar(int id,
                         const std::string& newLabel,
                         const BusinessPolarCoord& polar);

    // Delete
    bool deleteById(int id);

private:
    std::shared_ptr<DataCoordinateGroupRepository> m_repository;
    std::shared_ptr<DataCoordinateGroupMapper> m_mapper;
    std::shared_ptr<BusinessCoordinateConverter> m_converter;
};

} // namespace Business

namespace Presentation {

// Forward declarations (cross-namespace)
class BusinessCoordinateGroupService;
class BusinessCoordinateGroup;
struct BusinessCartesianCoord;
struct BusinessPolarCoord;

// --------------------
// View Models
// --------------------
struct PresentationCoordinateGroupViewModel final {
    int id{};
    std::string label;
    std::string timestampText;

    double x{};
    double y{};
    double r{};
    double thetaRadians{};
};

class PresentationCoordinateGroupFormatter final {
public:
    PresentationCoordinateGroupFormatter() = default;
    ~PresentationCoordinateGroupFormatter() = default;

    PresentationCoordinateGroupViewModel toViewModel(const BusinessCoordinateGroup& group) const;
    std::string formatTimestamp(std::int64_t timestampEpochSeconds) const;
};

// --------------------
// Controller (Swing UI would call these methods directly)
// --------------------
class PresentationDccController final {
public:
    PresentationDccController(std::shared_ptr<BusinessCoordinateGroupService> service,
                              std::shared_ptr<PresentationCoordinateGroupFormatter> formatter);
    ~PresentationDccController();

    // Create
    PresentationCoordinateGroupViewModel createGroupFromCartesian(const std::string& label,
                                                                  double x,
                                                                  double y);
    PresentationCoordinateGroupViewModel createGroupFromPolar(const std::string& label,
                                                              double r,
                                                              double thetaRadians);

    // Retrieve
    std::vector<PresentationCoordinateGroupViewModel> listAll() const;
    std::vector<PresentationCoordinateGroupViewModel> searchByLabel(const std::string& label) const;
    std::optional<PresentationCoordinateGroupViewModel> getById(int id) const;

    // Modify
    bool updateGroupFromCartesian(int id,
                                  const std::string& newLabel,
                                  double x,
                                  double y);
    bool updateGroupFromPolar(int id,
                              const std::string& newLabel,
                              double r,
                              double thetaRadians);

    // Delete
    bool deleteGroup(int id);

private:
    std::shared_ptr<BusinessCoordinateGroupService> m_service;
    std::shared_ptr<PresentationCoordinateGroupFormatter> m_formatter;
};

// --------------------
// UI Boundary (represents Java Swing layer conceptually)
// --------------------
class PresentationSwingDccView final {
public:
    explicit PresentationSwingDccView(std::shared_ptr<PresentationDccController> controller);
    ~PresentationSwingDccView();

    // UI lifecycle
    void show();
    void close();

    // UI actions (would be bound to Swing events)
    void onCreateFromCartesian(const std::string& label, double x, double y);
    void onCreateFromPolar(const std::string& label, double r, double thetaRadians);
    void onSearchByLabel(const std::string& label);
    void onListAll();
    void onSelectById(int id);
    void onUpdateFromCartesian(int id, const std::string& newLabel, double x, double y);
    void onUpdateFromPolar(int id, const std::string& newLabel, double r, double thetaRadians);
    void onDelete(int id);

private:
    std::shared_ptr<PresentationDccController> m_controller;
};

} // namespace Presentation